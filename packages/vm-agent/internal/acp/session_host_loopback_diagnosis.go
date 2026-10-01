package acp

import (
	"log/slog"
	"time"

	"github.com/google/uuid"
)

const unsupportedLoopbackAuthMessage = "This sign-in flow requires a local callback that this session cannot complete."

// reportUnsupportedLoopbackAuth is called only after a structurally valid URL
// request has been rejected solely for an explicit loopback callback. Recheck
// the live generation and prompt while holding the same lock order used by URL
// waiter registration, so a stale request cannot leave a misleading message.
func (h *SessionHost) reportUnsupportedLoopbackAuth(generation string) {
	if h.config.MessageReporter == nil || h.config.SessionID == "" {
		return
	}
	h.promptMu.Lock()
	defer h.promptMu.Unlock()
	h.interactionMu.Lock()
	defer h.interactionMu.Unlock()
	if !h.interactionConfig.Enabled || !h.interactionConfig.URLsEnabled ||
		generation == "" || generation != h.interactionGeneration ||
		!h.promptInFlight || h.promptAttempt == nil || h.promptAttempt.ctx.Err() != nil {
		return
	}
	if err := h.config.MessageReporter.Enqueue(MessageReportEntry{
		MessageID: uuid.NewString(), SessionID: h.config.SessionID, Role: "system",
		Content: unsupportedLoopbackAuthMessage, Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		// Reporter errors are not allowed to add untrusted URL metadata to logs.
		slog.Warn("Failed to persist loopback auth guidance")
	}
}
