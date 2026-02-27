import { eq, and, isNull, desc, sql, count } from 'drizzle-orm';
import { notifications, users } from '@cph/db';

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

export class NotificationService {
  /**
   * Create a notification for a specific user.
   */
  static async create(
    db: any,
    data: {
      tenantId: string;
      userId: string;
      type: string;
      title: string;
      message?: string;
      link?: string;
    },
  ) {
    const [notification] = await db
      .insert(notifications)
      .values({
        tenantId: data.tenantId,
        userId: data.userId,
        type: data.type as any,
        title: data.title,
        message: data.message || null,
        link: data.link || null,
      })
      .returning();

    return notification;
  }

  /**
   * Create a notification for all active users with a given role in a tenant.
   */
  static async createForRole(
    db: any,
    tenantId: string,
    role: string,
    data: {
      type: string;
      title: string;
      message?: string;
      link?: string;
    },
  ) {
    const roleUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.role, role as any),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );

    if (roleUsers.length === 0) return [];

    const inserted = await db
      .insert(notifications)
      .values(
        roleUsers.map((u: any) => ({
          tenantId,
          userId: u.id,
          type: data.type as any,
          title: data.title,
          message: data.message || null,
          link: data.link || null,
        })),
      )
      .returning();

    return inserted;
  }

  /**
   * List notifications for a user with pagination and optional filters.
   * Sorted by createdAt DESC.
   */
  static async list(
    db: any,
    userId: string,
    filters: {
      type?: string;
      isRead?: boolean;
      page: number;
      pageSize: number;
    },
  ) {
    const { type, isRead, page, pageSize } = filters;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [
      eq(notifications.userId, userId),
      isNull(notifications.deletedAt),
    ];

    if (type) {
      conditions.push(eq(notifications.type, type as any));
    }

    if (isRead !== undefined) {
      conditions.push(eq(notifications.isRead, isRead));
    }

    const whereClause = and(...conditions);

    // Total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(notifications)
      .where(whereClause);

    // Fetch paginated
    const rows = await db
      .select({
        id: notifications.id,
        tenantId: notifications.tenantId,
        userId: notifications.userId,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        link: notifications.link,
        isRead: notifications.isRead,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /**
   * Get unread notification count for a user.
   */
  static async getUnreadCount(db: any, userId: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          isNull(notifications.deletedAt),
        ),
      );

    return Number(result?.total ?? 0);
  }

  /**
   * Mark a single notification as read.
   */
  static async markRead(db: any, notificationId: string, userId: string) {
    const [updated] = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          isNull(notifications.deletedAt),
        ),
      )
      .returning();

    return updated || null;
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  static async markAllRead(db: any, userId: string) {
    const updated = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          isNull(notifications.deletedAt),
        ),
      )
      .returning();

    return { markedCount: updated.length };
  }
}
