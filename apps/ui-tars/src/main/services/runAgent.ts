/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert';

import { logger } from '@main/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import { type ConversationWithSoM } from '@main/shared/types';
import { GUIAgent, type GUIAgentConfig } from '@ui-tars/sdk';
import { markClickPosition } from '@main/utils/image';
import { UTIOService } from '@main/services/utio';
import { NutJSElectronOperator } from '../agent/operator';
import { DefaultBrowserOperator } from '@ui-tars/operator-browser';
import { showPredictionMarker } from '@main/window/ScreenMarker';
import { SettingStore } from '@main/store/setting';
import { AppState, Operator } from '@main/store/types';
import { GUIAgentManager } from '../ipcRoutes/agent';
import { checkBrowserAvailability } from './browserCheck';
import {
  getModelVersion,
  getSpByModelVersion,
  beforeAgentRun,
  afterAgentRun,
  getLocalBrowserSearchEngine,
} from '../utils/agent';
import { RMAOrchestrator, KnowledgeBase } from './rma';
import { ReflectionService } from './rma/reflectionService';

export const runAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  logger.info('runAgent');
  const settings = SettingStore.getStore();
  const { instructions, abortController } = getState();
  assert(instructions, 'instructions is required');

  const language = settings.language ?? 'en';

  logger.info('settings.operator', settings.operator);

  const handleData: GUIAgentConfig<NutJSElectronOperator>['onData'] = async ({
    data,
  }) => {
    const lastConv = getState().messages[getState().messages.length - 1];
    const { status, conversations, ...restUserData } = data;
    logger.info('[onGUIAgentData] status', status, conversations.length);

    const conversationsWithSoM: ConversationWithSoM[] = await Promise.all(
      conversations.map(async (conv) => {
        const { screenshotContext, predictionParsed } = conv;
        if (
          lastConv?.screenshotBase64 &&
          screenshotContext?.size &&
          predictionParsed
        ) {
          const screenshotBase64WithElementMarker = await markClickPosition({
            screenshotContext,
            base64: lastConv?.screenshotBase64,
            parsed: predictionParsed,
          }).catch((e) => {
            logger.error('[markClickPosition error]:', e);
            return '';
          });
          return {
            ...conv,
            screenshotBase64WithElementMarker,
          };
        }
        return conv;
      }),
    ).catch((e) => {
      logger.error('[conversationsWithSoM error]:', e);
      return conversations;
    });

    const {
      screenshotBase64,
      predictionParsed,
      screenshotContext,
      screenshotBase64WithElementMarker,
      ...rest
    } = conversationsWithSoM?.[conversationsWithSoM.length - 1] || {};
    logger.info(
      '[onGUIAgentData] ======data======\n',
      predictionParsed,
      screenshotContext,
      rest,
      status,
      '\n========',
    );

    if (
      settings.operator === Operator.LocalComputer &&
      predictionParsed?.length &&
      screenshotContext?.size &&
      !abortController?.signal?.aborted
    ) {
      showPredictionMarker(predictionParsed, screenshotContext);
    }

    setState({
      ...getState(),
      status,
      restUserData,
      messages: [...(getState().messages || []), ...conversationsWithSoM],
    });

    if (rmaEnabled && rma && screenshotBase64) {
      const lastActionText = predictionParsed?.[0]
        ? JSON.stringify(predictionParsed[0])
        : '';
      const { isLoop } = await rma.processStep(screenshotBase64, lastActionText);
      if (isLoop) {
        abortController?.abort();
        setState({
          ...getState(),
          status: StatusEnum.ERROR,
          errorMsg: rma.loopWarning ?? 'Loop detected',
        });
        return;
      }
    }
  };

  let operatorType: 'computer' | 'browser' = 'computer';
  let operator: NutJSElectronOperator | DefaultBrowserOperator;

  switch (settings.operator) {
    case Operator.LocalComputer:
      operator = new NutJSElectronOperator();
      operatorType = 'computer';
      break;
    case Operator.LocalBrowser:
      await checkBrowserAvailability();
      const { browserAvailable } = getState();
      if (!browserAvailable) {
        setState({
          ...getState(),
          status: StatusEnum.ERROR,
          errorMsg:
            'Browser is not available. Please install Chrome and try again.',
        });
        return;
      }
      operator = await DefaultBrowserOperator.getInstance(
        false,
        false,
        false,
        getState().status === StatusEnum.CALL_USER,
        getLocalBrowserSearchEngine(settings.searchEngineForBrowser),
      );
      operatorType = 'browser';
      break;
    default:
      operator = new NutJSElectronOperator();
      operatorType = 'computer';
      break;
  }

  const modelVersion = getModelVersion(settings.vlmProvider);
  const modelConfig = {
    baseURL: settings.vlmBaseUrl,
    apiKey: settings.vlmApiKey || 'local',
    model: settings.vlmModelName,
    useResponsesApi: settings.useResponsesApi,
  };

  const systemPrompt = getSpByModelVersion(
    modelVersion,
    language,
    operatorType,
  );

  const rmaEnabled = settings.rmaEnabled !== false;
  let rma: RMAOrchestrator | null = null;
  let finalSystemPrompt = systemPrompt;

  if (rmaEnabled) {
    const kb = new KnowledgeBase();
    const reflectionSvc = new ReflectionService(
      settings.reflectionBaseUrl || '',
      settings.vlmApiKey || '',
      settings.reflectionModelName || 'ui-tars-7b-dpo',
    );
    rma = new RMAOrchestrator(kb, reflectionSvc);
    rma.setInstruction(instructions);
    finalSystemPrompt = systemPrompt + rma.getSystemPromptAddition();
  }

  const guiAgent = new GUIAgent({
    model: modelConfig,
    systemPrompt: finalSystemPrompt,
    logger,
    signal: abortController?.signal,
    operator: operator!,
    onData: handleData,
    onError: (params) => {
      const { error } = params;
      logger.error('[onGUIAgentError]', settings, error);
      setState({
        ...getState(),
        status: StatusEnum.ERROR,
        errorMsg: JSON.stringify({
          status: error?.status,
          message: error?.message,
          stack: error?.stack,
        }),
      });
    },
    retry: {
      model: {
        maxRetries: 5,
      },
      screenshot: {
        maxRetries: 5,
      },
      execute: {
        maxRetries: 1,
      },
    },
    maxLoopCount: settings.maxLoopCount,
    loopIntervalInMs: settings.loopIntervalInMs,
    uiTarsVersion: modelVersion,
  });

  GUIAgentManager.getInstance().setAgent(guiAgent);
  UTIOService.getInstance().sendInstruction(instructions);

  const { sessionHistoryMessages } = getState();

  beforeAgentRun(settings.operator);

  const startTime = Date.now();

  await guiAgent.run(instructions, sessionHistoryMessages).catch((e) => {
    logger.error('[runAgentLoop error]', e);
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      errorMsg: e.message,
    });
  });

  logger.info('[runAgent Total cost]: ', (Date.now() - startTime) / 1000, 's');

  afterAgentRun(settings.operator);
};
