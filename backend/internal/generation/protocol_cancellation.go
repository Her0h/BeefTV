package generation

import (
	"context"
	"fmt"
	"strings"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/protocol"
)

// SupportsProviderCancellationForContext uses the installed protocol snapshot
// belonging to this workspace. The legacy native adapters remain available.
func SupportsProviderCancellationForContext(ctx context.Context, interfaceType string) bool {
	if _, ok := cancellableProtocolAdapter(ctx, interfaceType); ok {
		return true
	}
	return interfaceType == string(model.ChannelInterfaceGeminiVeo) || model.IsVolcengineArkVideoProtocol(model.ChannelInterfaceType(interfaceType))
}

func cancellableProtocolAdapter(ctx context.Context, interfaceType string) (protocol.Adapter, bool) {
	adapter, ok := DeclarativeProtocolAdapterForContext(ctx, interfaceType)
	if !ok {
		return nil, false
	}
	capability, ok := adapter.(protocol.CancelCapability)
	return adapter, ok && capability.CancelAvailable()
}

func cancellationPollContext(config Config, taskID string) (protocol.PollContext, error) {
	if strings.TrimSpace(taskID) == "" {
		return protocol.PollContext{}, fmt.Errorf("upstream task ID is required for cancellation")
	}
	return protocol.PollContext{
		BaseURL: config.BaseURL,
		Model:   config.Model,
		TaskID:  taskID,
		Request: ProtocolRequestFromInput(Input{Config: config}),
	}, nil
}

func cancelProtocolProviderTask(ctx context.Context, config Config, taskID string, adapter protocol.Adapter) error {
	poll, err := cancellationPollContext(config, taskID)
	if err != nil {
		return err
	}
	spec, err := adapter.BuildCancel(ctx, poll)
	if err != nil {
		return err
	}
	// Use the same authentication, outbound policy and receipts as generation.
	_, err = ExecuteProtocolRequest(ctx, config, spec)
	return err
}

func queryProtocolProviderCancellation(ctx context.Context, config Config, taskID string, adapter protocol.Adapter) (ProviderCancellationOutcome, string, error) {
	poll, err := cancellationPollContext(config, taskID)
	if err != nil {
		return "", "", err
	}
	spec, err := adapter.BuildPoll(ctx, poll)
	if err != nil {
		return "", "", err
	}
	body, err := ExecuteProtocolRequest(ctx, config, spec)
	if err != nil {
		// A missing/deleted task is not evidence that computation was cancelled.
		return "", "", err
	}
	state, err := adapter.ParsePoll(ctx, poll, body)
	if err != nil {
		return "", "", err
	}
	switch state.Status {
	case protocol.StatusCancelled:
		return ProviderCancellationConfirmed, string(state.Status), nil
	case protocol.StatusSucceeded:
		return ProviderCancellationSucceeded, string(state.Status), nil
	case protocol.StatusFailed:
		return ProviderCancellationFailed, string(state.Status), nil
	case protocol.StatusPending, protocol.StatusProcessing:
		return ProviderCancellationPending, string(state.Status), nil
	default:
		return "", string(state.Status), fmt.Errorf("upstream cancellation returned unknown state %q", state.Status)
	}
}
