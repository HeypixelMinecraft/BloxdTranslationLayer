import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  FluentProvider,
  Input,
  Label,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Switch,
  Tab,
  TabList,
  Text,
  Textarea,
  Tooltip,
  webDarkTheme,
} from '@fluentui/react-components';
import {
  Add24Regular,
  ArrowClockwise24Regular,
  ArrowSwap24Regular,
  Copy24Regular,
  Delete24Regular,
  Dismiss24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Guest24Regular,
  People24Regular,
  Play24Regular,
  Settings24Regular,
  Stop24Regular,
} from '@fluentui/react-icons';
import { createRoot } from 'react-dom/client';
import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountInfo, AppStatus, LogEntry, Settings } from '../shared/types';
import { getLang, getLanguages, setLang, t } from './i18n';
import './styles.css';

const emptyStatus: AppStatus = {
  service: {
    status: 'stopped',
    connected: false,
    version: 0,
    address: 'localhost',
    minecraftVersion: '1.8.9',
  },
  bloxd: {
    status: 'not-loaded',
    visible: false,
    provider: 'electron-cdp',
    templateCaptured: false,
  },
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <FatalError title="界面渲染失败" detail={this.state.error.stack || this.state.error.message} />;
    }
    return this.props.children;
  }
}

function FatalError({ title, detail }: { title: string; detail: string }) {
  return (
    <FluentProvider theme={webDarkTheme}>
      <main className="fatal">
        <Text as="h1" size={700} weight="semibold">{title}</Text>
        <Text className="muted">应用没有成功启动到管理界面。错误信息如下：</Text>
        <pre>{detail}</pre>
      </main>
    </FluentProvider>
  );
}

function statusIntent(status: string): 'success' | 'warning' | 'danger' | 'important' | 'subtle' {
  if (['running', 'ready', 'template-captured', 'connected'].includes(status)) return 'success';
  if (['starting', 'loading', 'waiting', 'needs-interaction'].includes(status)) return 'warning';
  if (['error'].includes(status)) return 'danger';
  if (['stopping'].includes(status)) return 'important';
  return 'subtle';
}

function accountStatusIntent(acc: AccountInfo): 'success' | 'warning' | 'danger' | 'subtle' {
  if (!acc.token3PSIDMC) return 'subtle';
  if (!acc.expireTime) return 'warning';
  const daysLeft = (acc.expireTime - Date.now()) / 86400000;
  if (daysLeft <= 0) return 'danger';
  if (daysLeft <= 3) return 'warning';
  return 'success';
}

function accountStatusLabel(acc: AccountInfo): string {
  if (!acc.token3PSIDMC) return t('accounts.offline');
  if (!acc.expireTime) return t('accounts.unknown');
  const daysLeft = (acc.expireTime - Date.now()) / 86400000;
  if (daysLeft <= 0) return t('accounts.expired');
  if (daysLeft <= 3) return t('accounts.expires.soon');
  return t('accounts.online');
}

function expireLabel(acc: AccountInfo): string {
  if (!acc.expireTime) return '-';
  const daysLeft = Math.floor((acc.expireTime - Date.now()) / 86400000);
  if (daysLeft < 0) return t('accounts.expires.past');
  if (daysLeft <= 1) return t('accounts.expires.soon');
  return t('accounts.expires.in', { days: daysLeft });
}

function formatToken(token: string): string {
  if (!token) return '-';
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function templateStatusText(status: AppStatus): string {
  if (status.bloxd.released) return t('bloxd.status.released');
  return status.bloxd.templateCaptured ? t('bloxd.status.captured') : t('bloxd.status.waiting');
}

function templateStatusIntent(status: AppStatus): 'success' | 'warning' {
  return status.bloxd.templateCaptured ? 'success' : 'warning';
}

function App() {
  if (!window.bloxdApi) {
    return <FatalError title={t('error.preload.title')} detail={t('error.preload.body')} />;
  }

  const [status, setStatus] = useState<AppStatus>(emptyStatus);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [tab, setTab] = useState('accounts');
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [lang, setLangState] = useState(getLang());
  const [confirmAction, setConfirmAction] = useState<{ key: string; params?: Record<string, string>; action: () => Promise<void> } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshAccounts = useCallback(async () => {
    const [list, current] = await Promise.all([
      window.bloxdApi.accountsList(),
      window.bloxdApi.accountsCurrent(),
    ]);
    setAccounts(list);
    setCurrentAccount(current);
  }, []);

  useEffect(() => {
    window.bloxdApi.serviceGetStatus().then(setStatus).catch((err) => setNotice(String(err)));
    window.bloxdApi.settingsGet().then(setSettings).catch((err) => setNotice(String(err)));
    refreshAccounts().catch((err) => setNotice(String(err)));
    const removeLog = window.bloxdApi.onLog((entry) => setLogs((current) => [...current.slice(-499), entry]));
    const removeStatus = window.bloxdApi.onStatus(setStatus);
    return () => {
      removeLog();
      removeStatus();
    };
  }, [refreshAccounts]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const canStart = status.service.status === 'stopped' || status.service.status === 'error';
  const canStop = status.service.status === 'running';
  const settingsText = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const currentAccountName = currentAccount?.name || '-';

  async function runAction(name: string, action: () => Promise<unknown>, thenRefreshAccounts = false) {
    setBusy(name);
    setNotice(undefined);
    try {
      await action();
      if (thenRefreshAccounts) await refreshAccounts();
      setStatus(await window.bloxdApi.serviceGetStatus());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function saveSetting(key: string, value: unknown) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await window.bloxdApi.settingsUpdate(next);
  }

  async function copyLogs() {
    await navigator.clipboard.writeText(logs.map((entry) => `[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`).join('\n'));
  }

  async function clearLogs() {
    await window.bloxdApi.logsClear();
    setLogs([]);
  }

  async function handleStartTranslation() {
    if (!currentAccount) {
      setNotice(t('service.need.account'));
      return;
    }
    if (!status.bloxd.templateCaptured) {
      setNotice(t('service.need.template'));
      await window.bloxdApi.bloxdShow();
      return;
    }
    await runAction(t('service.start'), window.bloxdApi.serviceStart);
  }

  async function handleOpenBloxd() {
    await runAction(t('bloxd.show'), window.bloxdApi.bloxdShow);
  }

  async function handleCaptureAccount() {
    await runAction(t('accounts.login.waiting'), async () => {
      const account = await window.bloxdApi.accountsLogin();
      if (!account) throw new Error('没有捕获到账号，请确认内置 Bloxd 页面已经登录。');
    }, true);
  }

  function confirmThen(key: string, action: () => Promise<void>, params?: Record<string, string>) {
    setConfirmAction({ key, params, action });
  }

  async function executeConfirmed() {
    if (!confirmAction) return;
    const { action } = confirmAction;
    setConfirmAction(null);
    await runAction(t('common.confirm'), action, true);
  }

  function handleLangChange(newLang: string) {
    setLang(newLang as 'zh' | 'en');
    setLangState(newLang as 'zh' | 'en');
  }

  return (
    <FluentProvider theme={webDarkTheme}>
      <main className="appShell">
        <aside className="sidebar">
          <div>
            <Text as="h1" size={600} weight="semibold">{t('app.title')}</Text>
            <Text className="muted">{t('app.subtitle')}</Text>
          </div>
          <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))} vertical>
            <Tab value="accounts" icon={<People24Regular />}>{t('tab.accounts')}</Tab>
            <Tab value="settings" icon={<Settings24Regular />}>{t('tab.settings')}</Tab>
          </TabList>
          <Select value={lang} onChange={(_, data) => handleLangChange(data.value)} className="languageSelect">
            {getLanguages().map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        </aside>

        <section className="content">
          <Card className="controlPanel">
            <div className="controlMain">
              <div>
                <Text as="h2" size={700} weight="semibold">{t('service.start')}</Text>
                <Text className="muted">
                  {t('service.address')}: {status.service.address} · Minecraft {status.service.minecraftVersion} · {t('accounts.current')}: {currentAccountName}
                </Text>
              </div>
              <div className="controlButtons">
                <Button appearance="primary" size="large" icon={<Play24Regular />} disabled={!canStart || Boolean(busy)} onClick={handleStartTranslation}>
                  {t('service.start')}
                </Button>
                <Button size="large" icon={<Stop24Regular />} disabled={!canStop || Boolean(busy)} onClick={() => runAction(t('service.stop'), window.bloxdApi.serviceStop)}>
                  {t('service.stop')}
                </Button>
                <Tooltip content={t('service.restart')} relationship="label">
                  <Button icon={<ArrowClockwise24Regular />} disabled={Boolean(busy)} onClick={() => runAction(t('service.restart'), window.bloxdApi.serviceRestart)} />
                </Tooltip>
              </div>
            </div>

            <div className="statusGrid">
              <div><Label>{t('service.status.running')}</Label><Badge appearance="filled" color={statusIntent(status.service.status)}>{t(`service.status.${status.service.status}`)}</Badge></div>
              <div><Label>{t('service.player')}</Label><Text>{status.service.playerName || t('service.no.client')}</Text></div>
              <div><Label>{t('service.game')}</Label><Text>{status.service.currentGame || t('service.not.queued')}</Text></div>
              <div><Label>{t('service.lobby')}</Label><Text>{status.service.currentLobby || t('service.not.joined')}</Text></div>
              <div><Label>{t('bloxd.status.template')}</Label><Badge appearance="filled" color={templateStatusIntent(status)}>{templateStatusText(status)}</Badge></div>
            </div>
          </Card>

          {notice ? (
            <MessageBar intent="warning">
              <MessageBarBody>{notice}</MessageBarBody>
            </MessageBar>
          ) : null}

          {busy ? <Spinner size="tiny" label={busy} /> : null}

          {tab === 'accounts' ? (
            <div className="workspace">
              <section className="accountsPane">
                <div className="sectionHeader">
                  <div>
                    <Text as="h2" size={600} weight="semibold">{t('accounts.title')}</Text>
                    <Text className="muted">{t('accounts.add.desc')}</Text>
                  </div>
                  <div className="actions">
                    <Button appearance="primary" icon={<Add24Regular />} disabled={Boolean(busy)} onClick={handleOpenBloxd}>{t('accounts.add')}</Button>
                    <Button icon={<Guest24Regular />} disabled={Boolean(busy)} onClick={handleCaptureAccount}>{t('accounts.capture')}</Button>
                    <Button icon={<ArrowClockwise24Regular />} disabled={Boolean(busy)} onClick={() => runAction(t('common.refresh'), () => refreshAccounts())}>{t('common.refresh')}</Button>
                  </div>
                </div>

                {accounts.length === 0 ? (
                  <Card className="emptyState">
                    <Guest24Regular className="emptyIcon" />
                    <Text size={500} weight="semibold">{t('accounts.no.accounts')}</Text>
                    <Text className="muted">{t('accounts.no.accounts.desc')}</Text>
                  </Card>
                ) : (
                  <div className="accountList">
                    {accounts.map((acc) => (
                      <Card key={acc.name} className={`accountCard ${acc.isActive ? 'active' : ''}`}>
                        <div className="accountCardContent">
                          <div className="accountCardMain">
                            <div className="accountCardHeader">
                              <Text weight="semibold" size={500}>{acc.name}</Text>
                              <Badge appearance="filled" color={accountStatusIntent(acc)}>{accountStatusLabel(acc)}</Badge>
                              {acc.isActive ? <Badge appearance="filled" color="brand">{t('accounts.current')}</Badge> : null}
                            </div>
                            <div className="accountCardDetails">
                              <div className="detailItem"><Label size="small">{t('accounts.expires')}</Label><Text size={200}>{expireLabel(acc)}</Text></div>
                              <div className="detailItem"><Label size="small">{t('accounts.token')}</Label><Text size={200} className="mono">{formatToken(acc.token3PSIDMC)}</Text></div>
                            </div>
                          </div>
                          <div className="accountCardActions">
                            {!acc.isActive ? (
                              <Tooltip content={t('accounts.switch')} relationship="label">
                                <Button icon={<ArrowSwap24Regular />} disabled={Boolean(busy)} onClick={() => confirmThen('accounts.switch', async () => { await window.bloxdApi.accountsSwitch(acc.name); }, { name: acc.name })} />
                              </Tooltip>
                            ) : null}
                            <Tooltip content={t('accounts.refresh')} relationship="label">
                              <Button icon={<ArrowClockwise24Regular />} disabled={Boolean(busy)} onClick={() => confirmThen('accounts.refresh', async () => { await window.bloxdApi.accountsRefreshTokens(acc.name); }, { name: acc.name })} />
                            </Tooltip>
                            <Tooltip content={t('accounts.delete')} relationship="label">
                              <Button icon={<Delete24Regular />} disabled={Boolean(busy)} onClick={() => confirmThen('accounts.delete', async () => { await window.bloxdApi.accountsDelete(acc.name); }, { name: acc.name })} />
                            </Tooltip>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <aside className="sidePane">
                <Card className="panel">
                  <CardHeader header={<Text weight="semibold">{t('bloxd.browser')}</Text>} />
                  <div className="facts">
                    <Label>{t('bloxd.status.template')}</Label>
                    <Text>{templateStatusText(status)}</Text>
                    <Label>URL</Label>
                    <Text className="truncate">{status.bloxd.url || '-'}</Text>
                  </div>
                  <div className="actions">
                    <Button icon={<Eye24Regular />} onClick={() => runAction(t('bloxd.show'), window.bloxdApi.bloxdShow)}>{t('bloxd.show')}</Button>
                    <Button icon={<EyeOff24Regular />} onClick={() => runAction(t('bloxd.hide'), window.bloxdApi.bloxdHide)}>{t('bloxd.hide')}</Button>
                  </div>
                </Card>
              </aside>
            </div>
          ) : (
            <Card className="settingsPanel">
              <CardHeader header={<Text weight="semibold">{t('tab.settings')}</Text>} />
              <div className="settingsGrid">
                <Field label={t('settings.server.name')}>
                  <Input value={String(settings.server_name ?? '')} onChange={(_, data) => saveSetting('server_name', data.value)} />
                </Field>
                <Switch checked={Boolean(settings.autoBuy)} label={t('settings.auto.buy')} onChange={(_, data) => saveSetting('autoBuy', data.checked)} />
                <Switch checked={Boolean(settings.autoNameChange)} label={t('settings.auto.nick')} onChange={(_, data) => saveSetting('autoNameChange', data.checked)} />
                <Field label={t('settings.raw')}>
                  <Textarea value={settingsText} readOnly resize="vertical" className="settingsJson" />
                </Field>
              </div>
            </Card>
          )}

          <Card className="logPanel">
            <CardHeader
              header={<Text weight="semibold">{t('logs.title')}</Text>}
              action={
                <div className="actions">
                  <Tooltip content={t('logs.copy')} relationship="label"><Button icon={<Copy24Regular />} size="small" onClick={copyLogs} /></Tooltip>
                  <Tooltip content={t('logs.clear')} relationship="label"><Button icon={<Dismiss24Regular />} size="small" onClick={clearLogs} /></Tooltip>
                </div>
              }
            />
            <div ref={logRef} className="logs">
              {logs.length === 0 ? <Text className="muted">{t('logs.empty')}</Text> : logs.map((entry) => (
                <div key={entry.id} className={`logLine ${entry.level}`}>
                  <span>{entry.time}</span>
                  <code>{entry.message}</code>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </main>

      <Dialog open={confirmAction !== null} onOpenChange={(_, data) => { if (!data.open) setConfirmAction(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('common.confirm')}</DialogTitle>
            <DialogContent>{confirmAction ? t(`${confirmAction.key}.confirm`, confirmAction.params as Record<string, string | number>) : ''}</DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={executeConfirmed}>{t('common.yes')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
