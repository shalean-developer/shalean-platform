export type CustomerNotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
  booking_id?: string | null;
};

export type CustomerNotificationsListResponse = {
  notifications: CustomerNotificationRow[];
  unreadCount: number;
};
