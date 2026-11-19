import { ElNotification } from 'element-plus'

export type NotifyType = 'success' | 'warning' | 'info' | 'error'

const STATUS_BAR_HEIGHT = 40
// Element Plus 会在 offset 基础上再加 16px，因此这里只传状态栏高度，
// 最终通知底部距窗口 56px，正好浮在状态栏上方。
const NOTIFICATION_OFFSET = STATUS_BAR_HEIGHT

/**
 * 全局消息提醒：统一从右下角（状态栏上方）从右向左弹出。
 * z-index 高于连接弹框（8000），避免提醒被弹框遮挡。
 */
export function notify(
  type: NotifyType,
  title: string,
  message: string,
  duration = 5000,
): void {
  ElNotification({
    type,
    title,
    message,
    duration,
    position: 'bottom-right',
    offset: NOTIFICATION_OFFSET,
    showClose: true,
    zIndex: 9200,
  })
}
