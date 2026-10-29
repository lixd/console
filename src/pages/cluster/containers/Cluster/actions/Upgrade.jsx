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
import React from 'react';
import { observer } from 'mobx-react';
import { ModalAction } from 'containers/Action';
import { rootStore } from 'stores';
import styles from './index.less';
import { registryAddress } from 'utils/registry';
import {
  versionCompare,
  versionCross,
  checkExpired,
  isDisableByProviderType,
} from 'utils';

@observer
export default class Upgrade extends ModalAction {
  static id = 'back-up';

  static title = t('Cluster Upgrade');

  get name() {
    return t('Cluster Upgrade');
  }

  async init() {
    this.store = rootStore.clusterStore;
    this.registryStore = rootStore.registryStore;
    await Promise.all([
      this.getVersion(),
      this.registryStore.fetchList({ limit: -1 }),
    ]);
    await this.initDefaultValue();
  }

  initDefaultValue = async () => {
    this.setState({
      targetVersions: this.getMetaVersion(),
    });
    this.updateDefaultValue();
  };

  get defaultValue() {
    const { imageRegistry = '' } = this.item;
    const registry = (this.registryStore.list.data || []).find(
      ({ name }) => name === imageRegistry
    );
    const versions = this.getMetaVersion();
    return {
      version: versions[0]?.value,
      imageRegistry: registry
        ? `${registry.name} (${registryAddress(registry)})`
        : imageRegistry,
    };
  }

  get alert() {
    return {
      message: (
        <div className={styles['upgrade-tip']}>
          <div>
            {t('Tips:') +
              t(
                'Please Ensure that the cluster node can access the specified image'
              )}
            <br />
          </div>
          <div className={styles.text}>{t('TIP_CLUSTER_UPGRADE_DESC')}</div>
        </div>
      ),
      type: 'info',
    };
  }

  async getVersion() {
    await this.store.fetchVersion({ limit: -1 });
  }

  static policy = 'clusters:edit';

  static isStatusRunning(item) {
    if (item.status === 'Running') {
      return true;
    }
    return false;
  }

  static isLicensExpiration = (item) =>
    checkExpired(item.licenseExpirationTime);

  static allowed = (item) =>
    Promise.resolve(
      this.isLicensExpiration(item) &&
        this.isStatusRunning(item) &&
        !isDisableByProviderType(item, ['kubeadm'])
    );

  getMetaVersion() {
    const { kubernetesVersion: currentVersion } = this.item;

    const data = this.store.versions.filter(
      ({ version }) => versionCompare(currentVersion, version) < 0
    );
    return (data || []).map(({ version }) => ({
      value: version,
      label: version,
    }));
  }

  get formItems() {
    return [
      {
        name: 'version',
        label: t('Target Version'),
        type: 'select',
        options: this.state.targetVersions,
        rules: [
          {
            pattern: /^v\d+(?:\.\d+){2}$/,
            message: t(
              'Please enter the version in correct format, such as vX.Y.Z'
            ),
          },
          {
            validator: (_, value) => {
              const { kubernetesVersion: currentVersion } = this.item;
              const v = versionCompare(currentVersion, value);
              const c = versionCross(currentVersion, value);

              if (v >= 0 || c) {
                return Promise.reject(t('Target version error'));
              }
              return Promise.resolve(true);
            },
          },
        ],
      },
      {
        name: 'imageRegistry',
        label: t('Image Registry'),
        type: 'label',
        tip: t(
          'Used to pull container images for Kubernetes, Calico and other components.'
        ),
      },
    ];
  }

  get successText() {
    return t('{name} is upgrading.', {
      action: this.name,
      name: this.item.name,
    });
  }

  get errorText() {
    return t('Unable to {action}.', {
      action: this.name,
    });
  }

  get cluster() {
    return this.props.item.name;
  }

  onSubmit = ({ version }) =>
    this.store.upgrade({ version }, { cluster: this.cluster });

  successCallback = () => this.store.fetchList({ cluster: this.cluster });
}
