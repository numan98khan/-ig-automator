import { TriggerConfig } from '../../types/automation';
import { AutomationTestContext } from './types';
import { isOutsideBusinessHours, matchesKeywords } from './utils';
import { matchesIntent } from './intentMatcher';

export type TriggerMatchDetails = {
  matched: boolean;
  matchedOn: {
    keywords: boolean;
    intent: boolean;
    link: boolean;
    attachment: boolean;
  };
  triggerMode: string;
};

export async function matchTriggerConfigDetailed(
  messageText: string,
  triggerConfig?: TriggerConfig,
  context?: AutomationTestContext,
): Promise<TriggerMatchDetails> {
  if (!triggerConfig) {
    return {
      matched: true,
      matchedOn: { keywords: false, intent: false, link: false, attachment: false },
      triggerMode: 'any',
    };
  }
  const keywordMatch = triggerConfig.keywordMatch || 'any';
  const triggerMode = triggerConfig.triggerMode || 'any';
  const intentText = triggerConfig.intentText?.trim() || '';
  const linkMatched = !!triggerConfig.matchOn?.link && !!context?.hasLink;
  const attachmentMatched = !!triggerConfig.matchOn?.attachment && !!context?.hasAttachment;
  const keywordList = Array.isArray(triggerConfig.keywords) ? triggerConfig.keywords : [];
  const keywordMatched = keywordList.length > 0
    ? matchesKeywords(messageText, keywordList, keywordMatch)
    : false;
  const keywordPass = keywordList.length > 0 ? keywordMatched : true;
  const intentMatched = intentText ? await matchesIntent(messageText, intentText) : false;

  if (
    triggerConfig.excludeKeywords &&
    triggerConfig.excludeKeywords.length > 0 &&
    matchesKeywords(messageText, triggerConfig.excludeKeywords, 'any')
  ) {
    return {
      matched: false,
      matchedOn: { keywords: keywordMatched, intent: intentMatched, link: linkMatched, attachment: attachmentMatched },
      triggerMode,
    };
  }
  if (
    triggerConfig.outsideBusinessHours &&
    !context?.forceOutsideBusinessHours &&
    !isOutsideBusinessHours(triggerConfig.businessHours)
  ) {
    return {
      matched: false,
      matchedOn: { keywords: keywordMatched, intent: intentMatched, link: linkMatched, attachment: attachmentMatched },
      triggerMode,
    };
  }

  let matched = false;
  if (triggerMode === 'keywords') {
    matched = linkMatched || attachmentMatched || keywordPass;
  } else if (triggerMode === 'intent') {
    matched = Boolean(intentText) && intentMatched;
  } else {
    matched = linkMatched || attachmentMatched || (intentText && intentMatched) || keywordPass;
  }

  return {
    matched,
    matchedOn: { keywords: keywordMatched, intent: intentMatched, link: linkMatched, attachment: attachmentMatched },
    triggerMode,
  };
}

export async function matchesTriggerConfig(
  messageText: string,
  triggerConfig?: TriggerConfig,
  context?: AutomationTestContext,
): Promise<boolean> {
  const result = await matchTriggerConfigDetailed(messageText, triggerConfig, context);
  return result.matched;
}
