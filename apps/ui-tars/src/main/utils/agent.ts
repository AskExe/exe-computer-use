import { UITarsModelVersion } from '@ui-tars/shared/constants';
import {
  Operator,
  SearchEngineForSettings,
  VLMProviderV2,
} from '../store/types';
import { getSystemPrompt, getSystemPromptV1_5 } from '../agent/prompts';
import {
  closeScreenMarker,
  hideScreenWaterFlow,
  hideWidgetWindow,
  showScreenWaterFlow,
  showWidgetWindow,
} from '../window/ScreenMarker';
import { hideMainWindow, showMainWindow } from '../window';
import { SearchEngine } from '@ui-tars/operator-browser';

// All providers use V1_5 prompt by default; user sets the model name manually
export const getModelVersion = (
  _provider: VLMProviderV2 | undefined,
): UITarsModelVersion => {
  return UITarsModelVersion.V1_5;
};

export const getSpByModelVersion = (
  modelVersion: UITarsModelVersion,
  language: 'zh' | 'en',
  operatorType: 'browser' | 'computer',
) => {
  switch (modelVersion) {
    case UITarsModelVersion.V1_5:
      return getSystemPromptV1_5(language, 'normal');
    default:
      return getSystemPrompt(language);
  }
};

export const getLocalBrowserSearchEngine = (
  engine?: SearchEngineForSettings,
) => {
  return (engine || SearchEngineForSettings.GOOGLE) as unknown as SearchEngine;
};

export const beforeAgentRun = async (operator: Operator) => {
  switch (operator) {
    case Operator.LocalComputer:
      showWidgetWindow();
      showScreenWaterFlow();
      hideMainWindow();
      break;
    case Operator.LocalBrowser:
      hideMainWindow();
      showWidgetWindow();
      break;
    default:
      break;
  }
};

export const afterAgentRun = (operator: Operator) => {
  switch (operator) {
    case Operator.LocalComputer:
      hideWidgetWindow();
      closeScreenMarker();
      hideScreenWaterFlow();
      showMainWindow();
      break;
    case Operator.LocalBrowser:
      hideWidgetWindow();
      showMainWindow();
      break;
    default:
      break;
  }
};
