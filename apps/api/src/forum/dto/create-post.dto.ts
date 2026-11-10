import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  Validate,
  ValidatorConstraint,
  isMongoId,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { CIRCLE_NAME_MAX_LENGTH } from '@/circle/circle.constants';
import { MAX_POST_TAGS, MIN_POST_TAGS, POST_TAGS, type PostTag } from '@/forum/post-tag.constants';
import { validationConstraint } from '@/common/validation/validation-constraints';

@ValidatorConstraint({ name: 'isExclusiveCircleReference', async: false })
class IsExclusiveCircleReferenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const circleId = 'circleId' in args.object ? args.object.circleId : undefined;
    const circleName = 'circleName' in args.object ? args.object.circleName : undefined;
    const hasCircleId = typeof circleId === 'string' && circleId.length > 0;
    const hasCircleName = typeof circleName === 'string' && circleName.trim().length > 0;
    if (hasCircleId === hasCircleName) return false;
    return hasCircleId ? isMongoId(circleId) : true;
  }

  defaultMessage(): string {
    return 'Exactly one of circleId or circleName must be provided';
  }
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, validationConstraint({ minLength: 1 }))
  @MaxLength(200, validationConstraint({ maxLength: 200 }))
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1, validationConstraint({ minLength: 1 }))
  @MaxLength(50000, validationConstraint({ maxLength: 50000 }))
  content!: string;

  @IsArray()
  @ArrayMinSize(MIN_POST_TAGS, validationConstraint({ minItems: MIN_POST_TAGS }))
  @ArrayMaxSize(MAX_POST_TAGS, validationConstraint({ maxItems: MAX_POST_TAGS }))
  @ArrayUnique()
  @IsEnum(POST_TAGS, {
    each: true,
    ...validationConstraint({ allowedValues: Object.values(POST_TAGS) }),
  })
  tags!: PostTag[];

  @Validate(IsExclusiveCircleReferenceConstraint)
  circleId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_NAME_MAX_LENGTH, validationConstraint({ maxLength: CIRCLE_NAME_MAX_LENGTH }))
  circleName?: string;
}
