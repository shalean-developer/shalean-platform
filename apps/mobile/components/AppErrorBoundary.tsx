import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { diagnosticLog } from "@/lib/diagnostics/logger";

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    diagnosticLog.error("Unhandled UI error", {
      message: error.message,
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-surface px-6" accessibilityRole="alert">
          <Text className="mb-2 text-center text-xl font-bold text-ink">Something went wrong</Text>
          <Text className="mb-6 text-center text-sm text-ink-muted">
            {this.state.error.message || "An unexpected error occurred."}
          </Text>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            className="min-h-12 items-center justify-center rounded-xl bg-brand-500 px-6 py-3"
          >
            <Text className="text-base font-semibold text-ink-inverse">Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
