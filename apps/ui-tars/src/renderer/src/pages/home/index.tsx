/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';

import { Operator } from '@main/store/types';
import { useSession } from '../../hooks/useSession';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';

import computerUseImg from '@resources/home_img/computer_use.png?url';
import browserUseImg from '@resources/home_img/browser_use.png?url';
import { sleep } from '@ui-tars/shared/utils';

import { DragArea } from '../../components/Common/drag';

const Home = () => {
  const navigate = useNavigate();
  const { createSession } = useSession();
  const [localConfig, setLocalConfig] = useState({
    open: false,
    operator: Operator.LocalComputer,
  });

  const toLocal = async (operator: Operator) => {
    const session = await createSession('New Session', {
      operator: operator,
    });

    navigate('/local', {
      state: {
        operator: operator,
        sessionId: session?.id,
        from: 'home',
      },
    });
  };

  const handleLocalPress = async (operator: Operator) => {
    const hasVLM = await checkVLMSettings();

    if (hasVLM) {
      toLocal(operator);
    } else {
      setLocalConfig({ open: true, operator: operator });
    }
  };

  const handleLocalSettingsSubmit = async () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
    await sleep(200);
    await toLocal(localConfig.operator);
  };

  const handleLocalSettingsClose = () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <DragArea></DragArea>
      <div className="w-full h-full flex flex-col items-center justify-center">
        <h1 className="text-2xl font-semibold mt-1 mb-8">
          Welcome to Exe Computer Use
        </h1>
        <div className="flex gap-6">
          <Card className="w-[400px] py-5">
            <CardHeader className="px-5">
              <CardTitle>Computer Operator</CardTitle>
              <CardDescription>
                Use the Exe Computer Use to automate and complete tasks directly on
                your computer with AI assistance.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <img
                src={computerUseImg}
                alt=""
                className="w-full h-full aspect-video object-fill rounded-lg"
              />
            </CardContent>
            <CardFooter className="gap-3 px-5 flex justify-between">
              <Button
                onClick={() => handleLocalPress(Operator.LocalComputer)}
                className="w-full"
              >
                Use Local Computer
              </Button>
            </CardFooter>
          </Card>
          <Card className="w-[400px] py-5">
            <CardHeader className="px-5">
              <CardTitle>Browser Operator</CardTitle>
              <CardDescription>
                Let the Exe Computer Use help you automate browser tasks, from
                navigating pages to filling out forms.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <img
                src={browserUseImg}
                alt=""
                className="w-full h-full aspect-video object-fill rounded-lg"
              />
            </CardContent>
            <CardFooter className="gap-3 px-5 flex justify-between">
              <Button
                onClick={() => handleLocalPress(Operator.LocalBrowser)}
                className="w-full"
              >
                Use Local Browser
              </Button>
            </CardFooter>
          </Card>
        </div>
        <LocalSettingsDialog
          isOpen={localConfig.open}
          onSubmit={handleLocalSettingsSubmit}
          onClose={handleLocalSettingsClose}
        />
      </div>
      <DragArea></DragArea>
    </div>
  );
};

export default Home;
