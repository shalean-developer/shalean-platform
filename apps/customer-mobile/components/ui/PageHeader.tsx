import { AppText } from "@/theme";
import { View } from "react-native";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
};

/** Consistent tab/page title block — uses screen-title + secondary tokens. */
export function PageHeader({ eyebrow, title, subtitle, className = "" }: Props) {
  return (
    <View className={`mb-5 ${className}`}>
      {eyebrow ? (
        <AppText variant="label" className="font-medium tracking-wide text-brand-600">
          {eyebrow}
        </AppText>
      ) : null}
      <AppText variant="title" className="text-ink">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="secondary" className="mt-1 text-ink-muted">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}
