import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ANNOUNCEMENT_STATUSES,
  Announcement,
} from '@/database/schemas/announcement.schema';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<Announcement>,
  ) {}

  async listActive() {
    const now = new Date();
    const items = await this.announcementModel
      .find({
        status: ANNOUNCEMENT_STATUSES.PUBLISHED,
        startsAt: { $lte: now },
        $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
      })
      .sort({ startsAt: -1, _id: -1 })
      .limit(5);
    return items.map((item) => ({
      id: item.id,
      titleZh: item.titleZh,
      titleEn: item.titleEn,
      bodyZh: item.bodyZh,
      bodyEn: item.bodyEn,
      kind: item.kind,
      dismissible: item.dismissible,
      linkUrl: item.linkUrl,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString() ?? null,
    }));
  }
}
