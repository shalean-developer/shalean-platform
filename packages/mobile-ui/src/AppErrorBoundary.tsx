import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Props = {
  children: ReactNode;
  onReset?: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

/** Shared error boundary — apps may inject logging via `onError`. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    if (__DEV__ && !this.props.onError) {
      console.error("[mobile-ui] Unhandled UI error", error.message, info.componentStack);
    }
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-surface px-6" accessibilityRole="alert">
          <Text className="mb-2 text-center text-title text-ink">Something went wrong</Text>
          <Text className="mb-6 text-center text-caption text-ink-muted">
            {this.state.error.message || "An unexpected error occurred."}
          </Text>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            className="min-h-touch items-center justify-center rounded-xl bg-brand-500 px-6 py-3"
          >
            <Text className="text-button text-ink-inverse">Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
