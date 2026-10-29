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
import { toJS } from 'mobx';
import { observer } from 'mobx-react';
import { ModalAction } from 'containers/Action';
import { rootStore } from 'stores';
import FORM_TEMPLATES from 'utils/form.templates';
import { merge } from 'lodash';
import { parseRegistryAddress, registryAddress } from 'utils/registry';

@observer
class Add extends ModalAction {
  init() {
    this.store = rootStore.registryStore;
  }

  static id = 'add';

  static title = t('Add');

  static policy = 'registries:edit';

  get module() {
    return 'registries';
  }

  get name() {
    return t('Add');
  }

  get defaultValue() {
    return {
      address: '',
      tlsCheck: true,
    };
  }

  static allowed = () => Promise.resolve(true);

  checkAddress = async (_, value) => {
    const address = parseRegistryAddress(value);
    if (!address)
      return Promise.reject(
        t(
          'Enter a complete registry address, such as https://harbor.example.com/kubeclipper.'
        )
      );
    const duplicate = toJS(this.store.list.data || []).some(
      (item) => registryAddress(item) === registryAddress(address)
    );
    return duplicate ? Promise.reject(t('Registry Repeat')) : Promise.resolve();
  };

  onTlsChange = (value) =>
    this.setState({
      tlsCheck: value,
    });

  get formItems() {
    const {
      tlsCheck = true,
      address = '',
      authEnabled = false,
      showCertificates = false,
    } = this.state;
    const isHttps = address.startsWith('https://');
    const isCheckTls = isHttps && tlsCheck;

    return [
      {
        name: 'name',
        label: t('Name'),
        type: 'input-name',
        required: true,
      },
      {
        name: 'description',
        label: t('Description'),
        type: 'input',
        placeholder: t('Please input description'),
      },
      {
        name: 'address',
        label: t('Registry Address'),
        type: 'input',
        placeholder: 'https://harbor.example.com/kubeclipper',
        validator: this.checkAddress,
        required: true,
        onChange: (event) => this.setState({ address: event.target.value }),
      },
      {
        name: 'authEnabled',
        label: t('Registry authentication'),
        type: 'switch',
        onChange: (value) => this.setState({ authEnabled: value }),
      },
      {
        name: 'registryUsername',
        label: t('Registry username'),
        type: 'input',
        required: authEnabled,
        hidden: !authEnabled,
      },
      {
        name: 'registryPassword',
        label: t('Registry password or token'),
        type: 'input-password',
        required: authEnabled,
        hidden: !authEnabled,
      },
      {
        name: 'showCertificates',
        type: 'more',
        hidden: !isHttps,
        onChange: (value) => this.setState({ showCertificates: value }),
      },
      {
        name: 'tlsCheck',
        label: t('TLS Check'),
        type: 'switch',
        hidden: !isHttps || !showCertificates,
        onChange: this.onTlsChange,
      },
      {
        name: 'ca',
        label: t('CA Certificate'),
        type: 'textarea',
        placeholder: t('Please input certificate'),
        hidden: !showCertificates || !isCheckTls,
      },
    ];
  }

  onSubmit = (values) => {
    const {
      name,
      address,
      description,
      ca,
      tlsCheck,
      authEnabled,
      registryUsername,
      registryPassword,
    } = values;
    const { scheme, host, repositoryPrefix } = parseRegistryAddress(address);

    const data = {
      metadata: {
        name,
        annotations: {
          'kubeclipper.io/description': description,
        },
      },
      host,
      repositoryPrefix,
      ...(authEnabled
        ? { auth: { username: registryUsername, password: registryPassword } }
        : {}),
      ca: scheme === 'https' && tlsCheck !== false ? ca : undefined,
      scheme,
      skipVerify: scheme === 'https' && tlsCheck === false,
    };

    const formTemplate = merge(FORM_TEMPLATES[this.module](), data);

    return this.store.create(formTemplate);
  };
}

export default Add;
