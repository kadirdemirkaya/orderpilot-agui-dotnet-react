using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OrderPilot.Api.Services;

// Gemini 3.x her tool call için tool_calls[].extra_content.google.thought_signature döner ve bir sonraki
// istekte bunu geri ister (yoksa HTTP 400). OpenAI SDK bu alanı bilmediği için düşürür.
// Bu handler imzayı yanıt akışında yakalar, giden istekte ilgili tool call'a geri ekler.
public sealed class GeminiThoughtSignatureHandler() : DelegatingHandler(new HttpClientHandler())
{
    private static readonly ConcurrentDictionary<string, string> Signatures = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.Content is not null)
            await InjectSignaturesAsync(request, ct);

        var response = await base.SendAsync(request, ct);

        if (response.IsSuccessStatusCode && response.Content.Headers.ContentType?.MediaType == "text/event-stream")
        {
            var content = new StreamContent(new SignatureCapturingStream(await response.Content.ReadAsStreamAsync(ct)));
            foreach (var header in response.Content.Headers)
                content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            response.Content = content;
        }

        return response;
    }

    private static async Task InjectSignaturesAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var json = await request.Content!.ReadAsStringAsync(ct);
        if (!json.Contains("tool_calls") || JsonNode.Parse(json) is not JsonObject root) return;

        var toolCalls = (root["messages"] as JsonArray ?? [])
            .SelectMany(m => m?["tool_calls"] as JsonArray ?? [])
            .OfType<JsonObject>();

        foreach (var call in toolCalls)
        {
            if (call["id"]?.GetValue<string>() is { } id && Signatures.TryGetValue(id, out var signature))
                call["extra_content"] = new JsonObject { ["google"] = new JsonObject { ["thought_signature"] = signature } };
        }

        request.Content = new StringContent(root.ToJsonString(), Encoding.UTF8, "application/json");
    }

    // SSE akışını olduğu gibi geçirir, "data:" satırlarındaki imzaları yan etki olarak kaydeder.
    private sealed class SignatureCapturingStream(Stream inner) : Stream
    {
        private readonly StringBuilder _line = new();
        private string? _lastToolCallId;

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
        {
            var read = await inner.ReadAsync(buffer, ct);
            foreach (var c in Encoding.UTF8.GetString(buffer.Span[..read]))
            {
                if (c != '\n') { _line.Append(c); continue; }
                var line = _line.ToString().Trim();
                _line.Clear();
                if (line.StartsWith("data: {")) Capture(line[6..]);
            }
            return read;
        }

        private void Capture(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                foreach (var choice in doc.RootElement.GetProperty("choices").EnumerateArray())
                {
                    if (!choice.TryGetProperty("delta", out var delta) || !delta.TryGetProperty("tool_calls", out var calls)) continue;
                    foreach (var call in calls.EnumerateArray())
                    {
                        if (call.TryGetProperty("id", out var id) && id.GetString() is { Length: > 0 } callId)
                            _lastToolCallId = callId;
                        if (_lastToolCallId is not null
                            && call.TryGetProperty("extra_content", out var extra)
                            && extra.TryGetProperty("google", out var google)
                            && google.TryGetProperty("thought_signature", out var sig))
                            Signatures[_lastToolCallId] = sig.GetString()!;
                    }
                }
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
            {
                // İmza içermeyen / farklı biçimli chunk: akışı bozmadan geç.
            }
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct) =>
            ReadAsync(buffer.AsMemory(offset, count), ct).AsTask();
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing) inner.Dispose();
            base.Dispose(disposing);
        }
    }
}
