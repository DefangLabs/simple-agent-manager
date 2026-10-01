package acp

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	acpsdk "github.com/coder/acp-go-sdk"
	"github.com/google/uuid"
)

// URL navigation is performed by the browser after an explicit creator gesture.
// SAM does not fetch this URL or follow redirects. Explicit local callbacks are
// rejected because a remote browser cannot complete the wrapper's loopback flow.
func eligibleAcpURL(raw string) bool {
	return eligibleAcpURLDepth(raw, 0)
}

func eligibleAcpURLDepth(raw string, depth int) bool {
	if depth > 2 {
		return false
	}
	if len(raw) == 0 || len(raw) > 8192 || strings.TrimSpace(raw) != raw || strings.ContainsAny(raw, "\\\r\n\t") {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Fragment != "" ||
		parsed.Hostname() == "" || (parsed.Port() != "" && parsed.Port() != "443") {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if net.ParseIP(host) != nil || !strings.Contains(host, ".") || strings.Contains(host, "..") ||
		strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".localhost") ||
		strings.HasSuffix(host, ".internal") {
		return false
	}
	parts := strings.Split(host, ".")
	for _, part := range parts {
		if part == "" || strings.HasPrefix(part, "xn--") || strings.HasPrefix(part, "-") || strings.HasSuffix(part, "-") {
			return false
		}
		for _, char := range part {
			if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-') {
				return false
			}
		}
	}
	if len(parts[len(parts)-1]) < 2 {
		return false
	}
	for _, char := range parts[len(parts)-1] {
		if char < 'a' || char > 'z' {
			return false
		}
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return false
	}
	for key, values := range query {
		switch strings.ToLower(key) {
		case "redirect", "redirect_uri", "redirect_url", "callback", "callback_uri", "callback_url", "return_to", "return_url", "return_uri", "next", "continue":
			for _, value := range values {
				if !eligibleAcpURLDepth(value, depth+1) {
					return false
				}
			}
		}
	}
	return true
}

func (h *SessionHost) registerURLWaiter(id, elicitationID, generation string, attemptID uint64,
	deadline time.Time, cancel context.CancelFunc) (*acpInteractionWaiter, bool) {
	h.promptMu.Lock()
	defer h.promptMu.Unlock()
	h.interactionMu.Lock()
	defer h.interactionMu.Unlock()
	if !h.interactionConfig.Enabled || !h.interactionConfig.URLsEnabled ||
		generation == "" || generation != h.interactionGeneration ||
		!h.promptInFlight || h.promptAttempt == nil || h.promptAttempt.id != attemptID ||
		h.promptAttempt.ctx.Err() != nil || len(h.urlElicitations) >= h.interactionConfig.ReceiptLimit {
		return nil, false
	}
	if _, exists := h.urlElicitations[elicitationID]; exists {
		return nil, false
	}
	waiter := &acpInteractionWaiter{generation: generation, attemptID: attemptID,
		urlRequest: true, result: make(chan acpInteractionWaitResult, 1), cancelRequest: cancel}
	h.interactionWaiters[id] = waiter
	h.urlElicitations[elicitationID] = acpUrlElicitation{interactionID: id, generation: generation, deadline: deadline}
	time.AfterFunc(time.Until(deadline), func() {
		h.interactionMu.Lock()
		defer h.interactionMu.Unlock()
		if entry, exists := h.urlElicitations[elicitationID]; exists && entry.interactionID == id {
			delete(h.urlElicitations, elicitationID)
		}
	})
	return waiter, true
}

func (h *SessionHost) requestURL(ctx context.Context, generation string,
	params acpsdk.UnstableCreateElicitationRequest) (acpsdk.UnstableCreateElicitationResponse, error) {
	config := h.acpInteractionConfigSnapshot()
	if params.Url == nil || params.Form != nil || len(params.Url.Meta) != 0 ||
		!config.Enabled || !config.URLsEnabled || config.validate() != nil ||
		h.config.ProjectID == "" || h.config.WorkspaceID == "" || h.config.SessionID == "" ||
		h.config.RuntimeIdentity == "" || h.config.CallbackToken == "" || h.config.ControlPlaneURL == "" ||
		!eligibleAcpURL(params.Url.Url) || len(params.Url.ElicitationId) == 0 || len(params.Url.ElicitationId) > 256 ||
		len(params.Url.Message) > config.RequestMaxBytes {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	attempt, ok := h.activePromptAttempt()
	if !ok {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	urlConfig := config
	urlConfig.PermissionDeadlineMs = config.URLDeadlineMs
	deadline, ok := h.permissionDeadline(attempt.ctx, urlConfig)
	if !ok {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	id := uuid.NewString()
	message := params.Url.Message
	detail := acpInteractionDetail{Message: &message, URL: params.Url.Url, ElicitationID: string(params.Url.ElicitationId)}
	encoded, err := json.Marshal(detail)
	if err != nil || len(encoded) > config.RequestMaxBytes {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	request := acpInteractionCreateRequest{ProtocolVersion: acpInteractionProtocolVersion,
		InteractionID: id, Generation: generation, RuntimeIdentity: h.config.RuntimeIdentity,
		AgentSessionID: h.config.SessionID, Kind: "url", Detail: detail, DeadlineAt: deadline.UnixMilli()}
	canonical, err := json.Marshal(request)
	if err != nil {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	digest := sha256.Sum256(canonical)
	request.PayloadHash = hex.EncodeToString(digest[:])
	requestCtx, cancel := context.WithDeadline(attempt.ctx, deadline)
	go func() {
		select {
		case <-attempt.done:
			cancel()
		case <-requestCtx.Done():
		}
	}()
	stopCancel := context.AfterFunc(ctx, cancel)
	defer stopCancel()
	defer cancel()
	waiter, ok := h.registerURLWaiter(id, string(params.Url.ElicitationId), generation, attempt.id, deadline, cancel)
	if !ok {
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	createDone := make(chan acpInteractionCreateResult, 1)
	go func() {
		outcome, err := h.createAcpInteraction(requestCtx, request)
		createDone <- acpInteractionCreateResult{outcome, err}
	}()
	var result acpInteractionWaitResult
	select {
	case result = <-waiter.result:
	case created := <-createDone:
		if created.outcome == acpInteractionCreateRejected {
			h.cancelAcpInteractionWaiter(id, generation, "wrapper_cancelled")
		}
		select {
		case result = <-waiter.result:
		case <-requestCtx.Done():
			reason := "wrapper_cancelled"
			if !h.now().Before(deadline) {
				reason = "expired"
			}
			h.cancelAcpInteractionWaiterForAttempt(id, generation, attempt.id, reason)
			result = <-waiter.result
		}
	case <-requestCtx.Done():
		reason := "wrapper_cancelled"
		if !h.now().Before(deadline) {
			reason = "expired"
		}
		h.cancelAcpInteractionWaiterForAttempt(id, generation, attempt.id, reason)
		result = <-waiter.result
	}
	if result.cancel {
		settleReason := result.reason
		if settleReason == "declined" {
			settleReason = "completed"
		}
		if settleReason == "" {
			settleReason = "wrapper_cancelled"
		}
		go h.settleAcpInteraction(acpInteractionSettleRequest{ProtocolVersion: acpInteractionProtocolVersion,
			InteractionID: id, Generation: generation, RuntimeIdentity: h.config.RuntimeIdentity,
			AgentSessionID: h.config.SessionID, Reason: settleReason}, deadline)
		h.interactionMu.Lock()
		delete(h.urlElicitations, string(params.Url.ElicitationId))
		h.interactionMu.Unlock()
		if result.reason == "declined" {
			return acpsdk.NewUnstableCreateElicitationResponseDecline(), nil
		}
		return acpsdk.NewUnstableCreateElicitationResponseCancel(), nil
	}
	return acpsdk.NewUnstableCreateElicitationResponseAccept(), nil
}

func (c *sessionHostClient) UnstableCompleteElicitation(_ context.Context,
	params acpsdk.UnstableCompleteElicitationNotification) error {
	if len(params.Meta) != 0 {
		return nil
	}
	h := c.host
	h.interactionMu.Lock()
	entry, exists := h.urlElicitations[string(params.ElicitationId)]
	if !exists || entry.generation != c.interactionGeneration || entry.generation != h.interactionGeneration || !entry.deadline.After(h.now()) {
		h.interactionMu.Unlock()
		return nil
	}
	delete(h.urlElicitations, string(params.ElicitationId))
	h.interactionMu.Unlock()
	go h.completeURLInteraction(entry, string(params.ElicitationId))
	return nil
}

func (h *SessionHost) completeURLInteraction(entry acpUrlElicitation, elicitationID string) {
	ctx, cancel := context.WithDeadline(context.Background(), entry.deadline)
	defer cancel()
	body, err := json.Marshal(map[string]any{"protocolVersion": acpInteractionProtocolVersion,
		"interactionId": entry.interactionID, "generation": entry.generation,
		"runtimeIdentity": h.config.RuntimeIdentity, "agentSessionId": h.config.SessionID,
		"elicitationId": elicitationID})
	if err != nil {
		return
	}
	endpoint := strings.TrimRight(h.config.ControlPlaneURL, "/") + "/api/projects/" +
		url.PathEscape(h.config.ProjectID) + "/workspaces/" + url.PathEscape(h.config.WorkspaceID) +
		"/acp-interactions/" + url.PathEscape(entry.interactionID) + "/complete-url"
	config := h.acpInteractionConfigSnapshot()
	for attempt := 0; ctx.Err() == nil; attempt++ {
		if attempt > 0 {
			delay := config.SettleRetrySteadyMs
			if attempt-1 < len(config.SettleRetryDelaysMs) {
				delay = config.SettleRetryDelaysMs[attempt-1]
			}
			timer := time.NewTimer(time.Duration(delay) * time.Millisecond)
			select {
			case <-timer.C:
			case <-ctx.Done():
				timer.Stop()
				return
			}
		}
		h.interactionMu.Lock()
		active := h.interactionGeneration == entry.generation
		h.interactionMu.Unlock()
		if !active {
			return
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Authorization", "Bearer "+h.config.CallbackToken)
		req.Header.Set("Content-Type", "application/json")
		resp, err := h.httpClient().Do(req)
		if err != nil {
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, config.ResponseMaxBytes))
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return
		}
		if resp.StatusCode == http.StatusConflict || resp.StatusCode == http.StatusGone ||
			resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return
		}
	}
}
