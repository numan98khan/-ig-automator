import { TriggerConfig } from '../../types/automation';
import { AutomationTestContext } from './types';
import { isOutsideBusinessHours, matchesKeywords } from './utils';
import { matchesIntent } from './intentMatcher';

export async function matchesTriggerConfig(
  messageText: string,
  triggerConfig?: TriggerConfig,
  context?: AutomationTestContext,
): Promise<boolean> {
  if (!triggerConfig) return true;
  const keywordMatch = triggerConfig.keywordMatch || 'any';
  const triggerMode = triggerConfig.triggerMode || 'any';
  const intentText = triggerConfig.intentText?.trim() || '';
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
  const keywordMatched = triggerConfig.keywords
    ? matchesKeywords(messageText, triggerConfig.keywords, keywordMatch)
    : true;
  const intentMatched = intentText ? await matchesIntent(messageText, intentText) : false;

  if (triggerMode === 'categories') {
    return categoryMatched;
  }

  if (triggerMode === 'keywords') {
    if (linkMatched || attachmentMatched) return true;
    return keywordMatched;
  }

  if (triggerMode === 'intent') {
    return Boolean(intentText) && intentMatched;
  }

  if (categoryMatched || linkMatched || attachmentMatched) {
    return true;
  }
  if (intentText && intentMatched) {
    return true;
  }
  if (categoryIds.length > 0 && !categoryMatched) {
    return false;
  }
  if (!keywordMatched) {
    return false;
  }
  return true;
}
