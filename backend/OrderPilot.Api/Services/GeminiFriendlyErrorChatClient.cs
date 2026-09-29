using System.ClientModel;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace OrderPilot.Api.Services;

// Gemini hatalarını (özellikle ücretsiz kotadaki HTTP 429) çökme yerine sohbette Türkçe mesaj olarak döner.
// AG-UI yalnızca streaming yolunu kullandığı için sadece o sarılır.
public class GeminiFriendlyErrorChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await using var stream = base.GetStreamingResponseAsync(messages, options, cancellationToken)
            .GetAsyncEnumerator(cancellationToken);

        while (true)
        {
            string? error = null;
            try
            {
                if (!await stream.MoveNextAsync()) yield break;
            }
            catch (ClientResultException ex) when (ex.Status == 429)
            {
                error = "⚠️ Gemini istek kotası aşıldı (HTTP 429). Birkaç saniye bekleyip tekrar deneyin.";
            }
            catch (ClientResultException ex)
            {
                error = $"⚠️ Gemini hatası (HTTP {ex.Status}): {ex.Message}";
            }

            if (error is not null)
            {
                yield return new ChatResponseUpdate(ChatRole.Assistant, error) { MessageId = Guid.NewGuid().ToString("N") };
                yield break;
            }

            yield return stream.Current;
        }
    }
}
