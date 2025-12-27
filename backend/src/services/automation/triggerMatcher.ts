import { TriggerConfig } from '../../types/automation';
import { AutomationTestContext } from './types';
import { isOutsideBusinessHours, matchesKeywords } from './utils';

export function matchesTriggerConfig(
  messageText: string,
  triggerConfig?: TriggerConfig,
  context?: AutomationTestContext,
): boolean {
  if (!triggerConfig) return true;
  const keywordMatch = triggerConfig.keywordMatch || 'any';
  if (
    triggerConfig.excludeKeywords &&
    triggerConfig.excludeKeywords.length > 0 &&
    matchesKeywords(messageText, triggerConfig.excludeKeywords, 'any')
  ) {
    return false;
  }
  if (
    triggerConfig.outsideBusinessHours &&
    !context?.forceOutsideBusinessHours &&
    !isOutsideBusinessHours(triggerConfig.businessHours)
  ) {
    return false;
  }
  const categoryIds = triggerConfig.categoryIds || [];
  const categoryMatched = categoryIds.length > 0
    ? Boolean(context?.categoryId && categoryIds.includes(context.categoryId))
    : false;
  const linkMatched = !!triggerConfig.matchOn?.link && !!context?.hasLink;
  const attachmentMatched = !!triggerConfig.matchOn?.attachment && !!context?.hasAttachment;
  if (categoryMatched || linkMatched || attachmentMatched) {
    return true;
  }
  if (categoryIds.length > 0 && !categoryMatched) {
    return false;
  }
  if (triggerConfig.keywords && !matchesKeywords(messageText, triggerConfig.keywords, keywordMatch)) {
    return false;
  }
  return true;
}
