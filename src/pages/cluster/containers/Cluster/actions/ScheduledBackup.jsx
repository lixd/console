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
import { observer } from 'mobx-react';
import { ModalAction } from 'containers/Action';
import { parseInt, set } from 'lodash';
import { rootStore } from 'stores';
import { parseExpression, fieldsToExpression } from 'cron-parser';
import moment from 'moment';
import Notify from 'components/Notify';
import { cronTypeOption } from 'resources/date';
import FORM_TEMPLATES from 'utils/form.templates';

@observer
class ScheduledBackup extends ModalAction {
  init() {
    this.store = rootStore.cornBackupStore;
    this.clusterStore = rootStore.clusterStore;
  }

  static id = 'scheduled-backup';

  static buttonText = t('Scheduled Backup');

  static title = t('Scheduled Backup');

  static policy = 'clusters:create';

  static actionType = 'notice';

  static get modalSize() {
    return 'middle';
  }

  get name() {
    return t('Add');
  }

  get module() {
    return 'scheduledBackup';
  }

  static checkNotice = (item) => {
    const { backupPoint } = item;
    if (!backupPoint) {
      Notify.error(t('Please add a backup point in the edit cluster'));
      return false;
    }
    return true;
  };

  static isStatusRunning({ status }) {
    if (status === 'Running') {
      return true;
    }
    return false;
  }

  static allowed = (item) => Promise.resolve(this.isStatusRunning(item));

  get defaultValue() {
    const { backupPoint } = this.item;

    return {
      backupPoint,
      type: cronTypeOption[0].value,
    };
  }

  get currentType() {
    return this.state.type;
  }

  get formItems() {
    return [
      {
        name: 'backupPoint',
        label: t('BackupPoint'),
        type: 'label',
      },
      {
        name: 'name',
        label: t('Name'),
        type: 'input',
        required: true,
      },
      {
        name: 'type',
        label: t('Type'),
        type: 'select',
        options: cronTypeOption,
        required: true,
      },
      {
        name: 'cycle',
        label: t('Cycle'),
        type: 'select-cycle',
        hidden: this.currentType !== 'Repeat',
        required: true,
      },

      {
        name: 'date',
        label: t('Time'),
        type: 'date-picker',
        showTime: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        hidden: this.currentType !== 'OnlyOnce',
        required: true,
      },
      {
        name: 'time',
        label: t('Time'),
        type: 'time-picker',
        format: 'HH:mm',
        hidden: this.currentType !== 'Repeat',
        required: true,
      },
      {
        name: 'maxBackupNum',
        label: t('Number of valid backups'),
        type: 'input-number',
        hidden: this.currentType !== 'Repeat',
        min: 1,
        required: true,
      },
    ];
  }

  onSubmit = (values) => {
    const formTemplate = FORM_TEMPLATES[this.module]();
    const { id } = this.item;
    const { name, type, time, cycle, date, maxBackupNum } = values;

    set(formTemplate, 'metadata.name', name);
    set(formTemplate, 'spec.clusterName', id);

    if (type === 'OnlyOnce') {
      const runAt = moment(date).format();
      set(formTemplate, 'spec.runAt', runAt);
    } else {
      const { firstLevelSelected, secondLevelSelected } = cycle;
      const interval = parseExpression(firstLevelSelected.value);
      const fields = JSON.parse(JSON.stringify(interval.fields));
      if (secondLevelSelected?.value) {
        fields[firstLevelSelected.key] = [
          parseInt(secondLevelSelected.value, 10),
        ];
      }

      const selectedHour = moment(time).hour();
      const selectedMinute = moment(time).minute();
      const selectedSecond = moment(time).second();
      fields.hour = [selectedHour];
      fields.minute = [selectedMinute];
      fields.second = [selectedSecond];
      const modifiedInterval = fieldsToExpression(fields);
      const schedule = modifiedInterval.stringify();
      const spec = {
        schedule,
        maxBackupNum,
      };
      set(formTemplate, 'spec', {
        ...formTemplate.spec,
        ...spec,
      });
    }
    return this.store.create(formTemplate, { name });
  };
}

export default ScheduledBackup;