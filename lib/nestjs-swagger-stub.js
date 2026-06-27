// No-op stub for @nestjs/swagger — used only in the frontend bundle.
// The decorators (ApiProperty, etc.) are NestJS-only; they do nothing in a browser context.
'use strict';

const noop = () => () => {};

module.exports = {
  ApiProperty: noop,
  ApiPropertyOptional: noop,
  ApiHideProperty: noop,
  PartialType: (cls) => cls,
  OmitType: (cls) => cls,
  PickType: (cls) => cls,
  IntersectionType: (a) => a,
  ApiTags: noop,
  ApiBearerAuth: noop,
  ApiOperation: noop,
  ApiResponse: noop,
};
