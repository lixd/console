/*
 * Copyright 2021 KubeClipper Authors.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import { ConfirmAction } from 'containers/Action';
import { rootStore } from 'stores';

const { operationStore } = rootStore;
export default class Index extends ConfirmAction {
  get id() {
    return 'retry';
  }

  get title() {
    return t('Retry');
  }

  get buttonText() {
    return t('Retry');
  }

  get actionName() {
    return t('retry');
  }

  get notAllowAction() {
    return ['BackupCluster', 'RecoveryCluster'];
  }

  isFailedStatus = (item) => {
    const { uid, phase, operationName } = item;
    return (
      operationStore.list.page === 1 &&
      !!uid &&
      operationStore.latestOperationUID === uid &&
      ['Failed', 'TimedOut', 'Canceled'].includes(phase) &&
      (phase === 'Canceled' || !this.notAllowAction.includes(operationName))
    );
  };

  allowedCheckFunc = (item) => this.isFailedStatus(item);

  policy = () => 'clusters:edit';

  confirmContext = () =>
    t('Retry operation from the last failure, are you sure to retry?');

  submitSuccessMsg = (data) => {
    const name = this.getName(data);
    return t('Performing retry from falied operation: {name}', { name });
  };

  onSubmit = (data) => {
    const { id } = data;

    return operationStore.retry({ id }, data);
  };
}
