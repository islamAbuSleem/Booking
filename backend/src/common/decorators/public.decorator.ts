import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** T14 reads this. Today it is metadata only, and every route is public because there is
 *  no guard yet. Declared now so the convention is not retrofit onto every controller. */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
