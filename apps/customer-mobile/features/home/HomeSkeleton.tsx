import { View } from "react-native";
import { Skeleton } from "@shalean/mobile-ui";

export function HomeSkeleton() {
  return (
    <View className="gap-4 px-5 pt-3">
      <View className="mb-1 flex-row items-center justify-between">
        <View className="flex-1 gap-2">
          <Skeleton width="35%" height={14} />
          <Skeleton width="55%" height={28} />
        </View>
        <View className="flex-row gap-2.5">
          <Skeleton width={46} height={46} rounded="full" />
          <Skeleton width={46} height={46} rounded="full" />
        </View>
      </View>

      <View className="flex-row gap-3">
        <Skeleton width="78%" height={52} rounded="full" />
        <Skeleton width={52} height={52} rounded="full" />
      </View>

      <View className="flex-row justify-between">
        <Skeleton width="30%" height={18} />
        <Skeleton width="18%" height={14} />
      </View>
      <View className="flex-row gap-3">
        <Skeleton width={88} height={110} rounded="lg" />
        <Skeleton width={88} height={110} rounded="lg" />
        <Skeleton width={88} height={110} rounded="lg" />
        <Skeleton width={88} height={110} rounded="lg" />
      </View>

      <Skeleton width="100%" height={168} rounded="lg" />

      <View className="flex-row justify-between">
        <Skeleton width="40%" height={18} />
        <Skeleton width="18%" height={14} />
      </View>
      <Skeleton width="100%" height={88} rounded="lg" />
      <Skeleton width="100%" height={88} rounded="lg" />
    </View>
  );
}
