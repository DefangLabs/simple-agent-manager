package acp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"time"
)

// --- Internal: helpers ---

func (h *SessionHost) currentSessionState() (SessionHostStatus, string, string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.status, h.agentType, h.statusErr
}

// promptTimeout returns the configured prompt timeout. 0 means no timeout.
func (h *SessionHost) promptTimeout() time.Duration {
	return h.config.PromptTimeout
}

func (h *SessionHost) promptCancelGracePeriod() time.Duration {
	if h.config.PromptCancelGracePeriod > 0 {
		return h.config.PromptCancelGracePeriod
	}
	return DefaultPromptCancelGracePeriod
}

func (h *SessionHost) beginPrompt(cancel context.CancelFunc) (uint64, bool) {
	h.promptMu.Lock()
	defer h.promptMu.Unlock()
	if h.promptInFlight {
		return 0, false
	}
	h.promptInFlight = true
	promptID := atomic.AddUint64(&h.promptSeq, 1)
	h.promptInFlightID = promptID

	h.promptCancelMu.Lock()
	h.promptCancel = cancel
	h.activePromptID = promptID
	h.promptCancelRequested = false
	h.promptCancelMu.Unlock()
	return promptID, true
}

func (h *SessionHost) endPrompt(promptID uint64) {
	h.promptMu.Lock()
	if h.promptInFlightID == promptID {
		h.promptInFlight = false
		h.promptInFlightID = 0
	}
	h.promptMu.Unlock()

	h.promptCancelMu.Lock()
	if h.activePromptID == promptID {
		h.activePromptID = 0
		h.promptCancel = nil
		h.promptCancelRequested = false
	}
	h.promptCancelMu.Unlock()
}

// claimPromptCompletion atomically assigns terminal ownership for a prompt.
// Both the normal Prompt return path and the force-stop watchdog must claim
// before publishing lifecycle state or invoking OnPromptComplete.
func (h *SessionHost) claimPromptCompletion(promptID uint64) (bool, bool) {
	h.promptCancelMu.Lock()
	defer h.promptCancelMu.Unlock()
	if h.activePromptID != promptID {
		return false, false
	}
	cancelRequested := h.promptCancelRequested
	h.activePromptID = 0
	h.promptCancel = nil
	h.promptCancelRequested = false
	return cancelRequested, true
}

func (h *SessionHost) watchPromptTimeout(
	promptID uint64,
	promptCtx context.Context,
	done <-chan struct{},
	viewerID string,
	reqID json.RawMessage,
	timeout time.Duration,
) {
	select {
	case <-done:
		return
	case <-promptCtx.Done():
		if !errors.Is(promptCtx.Err(), context.DeadlineExceeded) {
			return
		}
		msg := fmt.Sprintf("Prompt timed out after %s", timeout)
		h.sendJSONRPCErrorToViewer(viewerID, reqID, -32603, msg)
		h.triggerPromptForceStopIfStuck(promptID, msg)
	}
}

func (h *SessionHost) triggerPromptForceStopIfStuck(promptID uint64, reason string) {
	if _, claimed := h.claimPromptCompletion(promptID); !claimed {
		return
	}

	h.promptMu.Lock()
	if h.promptInFlightID == promptID || h.promptInFlightID == 0 {
		h.promptInFlight = false
		h.promptInFlightID = 0
	}
	h.promptMu.Unlock()

	h.mu.Lock()
	agentType := h.agentType
	if h.status == HostPrompting {
		h.status = HostError
		h.statusErr = reason
	}
	h.stopCurrentAgentLocked()
	h.mu.Unlock()

	h.reportLifecycle("error", "ACP prompt force-stopped", map[string]interface{}{
		"reason": reason,
	})
	h.broadcastControl(MsgSessionPromptDone, nil)
	h.broadcastAgentStatus(StatusError, agentType, reason)
	// Clearing activePromptID above makes HandlePrompt return without reaching
	// finishPrompt. This force-stop branch therefore owns the terminal callback;
	// without it, task-driven sessions remain active after their runtime is gone.
	h.notifyPromptComplete(fatalErrorStopReason, errors.New(reason))
	// Report idle so the browser status bar clears the "prompting" spinner.
	// The error state is already broadcast via broadcastAgentStatus above.
	h.reportActivity("idle")
}

func (h *SessionHost) setStatus(status SessionHostStatus, errMsg string) {
	h.mu.Lock()
	h.status = status
	h.statusErr = errMsg
	h.mu.Unlock()
}
