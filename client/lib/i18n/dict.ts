export type Locale = 'en' | 'zh';

export const defaultLocale: Locale = 'zh';

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文'
};

const en = {
  app: {
    title: 'LanDrop',
    subtitle: 'Peer transfer desk',
    description: 'Local network file and text transfer'
  },
  connection: {
    connecting: 'connecting',
    connected: 'connected',
    disconnected: 'disconnected'
  },
  device: {
    name: 'Device name',
    yourDevice: 'Your device',
    waitingForId: 'Waiting for peer id',
    reconnect: 'Reconnect',
    renamePlaceholder: 'Rename device',
    device: 'Device'
  },
  room: {
    joinRoom: 'Join room',
    roomName: 'Room'
  },
  share: {
    qrCode: 'LanDrop QR code',
    qrPlaceholder: 'QR',
    loadingLink: 'Loading share link',
    copyLink: 'Copy link',
    copied: 'Copied'
  },
  peers: {
    onlineDevices: 'Online devices',
    available: '{{count}} available',
    waitingForPeers: 'Waiting for peers',
    peerLinkReady: 'Peer link ready',
    openingPeerLink: 'Opening peer link',
    scanHint: 'Scan the code or open the link on another device.',
    sendText: 'Send text to {{name}}',
    sendFile: 'Send file to {{name}}',
    actionText: 'Text',
    actionFile: 'File'
  },
  inbox: {
    incoming: 'Incoming',
    items: '{{count}} items',
    noArrivals: 'No arrivals yet',
    emptyHint: 'Received text and files will appear here.',
    textFrom: 'Text from {{name}}',
    fileFrom: 'File from {{name}}',
    copyText: 'Copy text',
    downloadFile: 'Download {{name}}'
  },
  log: {
    transferLog: 'Transfer log',
    recentActivity: 'Recent activity',
    emptyHint: 'Actions will be listed here.',
    directionSent: 'sent',
    directionReceived: 'received',
    directionSystem: 'system'
  },
  dialog: {
    close: 'Close dialog',
    sendTextTitle: 'Send text to {{name}}',
    sendFileTitle: 'Send file to {{name}}',
    textPlaceholder: 'Paste or type text',
    sendTextBtn: 'Send text',
    chooseFile: 'Choose a file',
    fileHint: 'Files stream peer-to-peer and are not stored in the cloud.',
    sendFileBtn: 'Send file',
    sendingProgress: '{{progress}}%'
  },
  errors: {
    connectionFailed: 'Connection failed',
    unableCreateOffer: 'Unable to create WebRTC offer',
    signalFailed: 'Signal failed',
    unableProcessSignal: 'Unable to process WebRTC signal',
    messageFailed: 'Message failed',
    deviceNotReady: 'Device not ready',
    waitForPeerLink: 'Wait for the peer-to-peer link to open.',
    peerLinkClosed: 'Peer link closed',
    receiverNotConfirm: 'Receiver did not confirm the file transfer',
    peerLinkBusy: 'Peer link is busy',
    sendFailed: 'Send failed',
    unknownError: 'Unknown error'
  },
  transfer: {
    receiving: 'Receiving {{name}}',
    sizeFrom: '{{size}} from {{name}}',
    fileTo: 'File to {{name}}',
    textTo: 'Text to {{name}}',
    fileFrom: 'File from {{name}}',
    textFrom: 'Text from {{name}}'
  },
  browser: {
    browser: 'Browser',
    on: 'on'
  },
  diagnostics: {
    eyebrow: 'Diagnostics',
    title: 'Connection health',
    signal: 'Signal',
    p2p: 'P2P link',
    ice: 'ICE/TURN',
    reconnect: 'Refresh link',
    noRecentIssue: 'No recent connection issue.',
    p2pWaiting: 'Waiting for another device',
    p2pSummary: '{{ready}} ready / {{total}} devices',
    peerDetails: 'Peer connection details',
    peerState: 'WebRTC {{connection}} · ICE {{ice}} · Channel {{channel}}',
    privacy: 'Files and text move directly between browsers. Cloudflare only handles signaling and temporary TURN credentials.',
    turnFallbackTitle: 'TURN is not active',
    turnFallbackIssue: 'Using STUN fallback. Remote networks may need Cloudflare TURN.',
    signalErrorIssue: 'Signal connection failed. Check the network or reconnect.',
    channelErrorIssue: 'Data channel to {{name}} reported an error.',
    peerFailedIssue: 'Peer connection to {{name}} failed. TURN may be required.',
    iceFailedTitle: 'ICE failed',
    iceFailedIssue: 'ICE negotiation with {{name}} failed. Try Cloudflare TURN.',
    iceDisconnectedIssue: 'ICE connection with {{name}} was interrupted.',
    signalState: {
      connecting: 'connecting',
      connected: 'connected',
      disconnected: 'disconnected'
    },
    iceSource: {
      loading: 'checking',
      fallback: 'STUN fallback',
      'cloudflare-turn': 'Cloudflare TURN'
    }
  }
};

const zh: typeof en = {
  app: {
    title: 'LanDrop',
    subtitle: '点对点传输台',
    description: '局域网文件和文本传输工具'
  },
  connection: {
    connecting: '连接中',
    connected: '已连接',
    disconnected: '已断开'
  },
  device: {
    name: '设备名称',
    yourDevice: '你的设备',
    waitingForId: '等待获取设备 ID',
    reconnect: '重新连接',
    renamePlaceholder: '重命名设备',
    device: '设备'
  },
  room: {
    joinRoom: '加入房间',
    roomName: '房间'
  },
  share: {
    qrCode: 'LanDrop 二维码',
    qrPlaceholder: '二维码',
    loadingLink: '正在加载分享链接',
    copyLink: '复制链接',
    copied: '已复制'
  },
  peers: {
    onlineDevices: '在线设备',
    available: '{{count}} 个可用',
    waitingForPeers: '等待其他设备加入',
    peerLinkReady: '点对点连接就绪',
    openingPeerLink: '正在建立点对点连接',
    scanHint: '在另一台设备上扫描二维码或打开链接。',
    sendText: '发送文本给 {{name}}',
    sendFile: '发送文件给 {{name}}',
    actionText: '文本',
    actionFile: '文件'
  },
  inbox: {
    incoming: '收件箱',
    items: '{{count}} 个项目',
    noArrivals: '还没有收到内容',
    emptyHint: '收到的文本和文件将显示在这里。',
    textFrom: '来自 {{name}} 的文本',
    fileFrom: '来自 {{name}} 的文件',
    copyText: '复制文本',
    downloadFile: '下载 {{name}}'
  },
  log: {
    transferLog: '传输日志',
    recentActivity: '最近活动',
    emptyHint: '操作记录将显示在这里。',
    directionSent: '发送',
    directionReceived: '接收',
    directionSystem: '系统'
  },
  dialog: {
    close: '关闭对话框',
    sendTextTitle: '发送文本给 {{name}}',
    sendFileTitle: '发送文件给 {{name}}',
    textPlaceholder: '粘贴或输入文本',
    sendTextBtn: '发送文本',
    chooseFile: '选择文件',
    fileHint: '文件点对点传输，不会存储在云端。',
    sendFileBtn: '发送文件',
    sendingProgress: '{{progress}}%'
  },
  errors: {
    connectionFailed: '连接失败',
    unableCreateOffer: '无法创建 WebRTC 提议',
    signalFailed: '信令失败',
    unableProcessSignal: '无法处理 WebRTC 信令',
    messageFailed: '消息处理失败',
    deviceNotReady: '设备未就绪',
    waitForPeerLink: '等待点对点连接建立。',
    peerLinkClosed: '点对点连接已关闭',
    receiverNotConfirm: '接收方未确认文件传输',
    peerLinkBusy: '点对点连接繁忙',
    sendFailed: '发送失败',
    unknownError: '未知错误'
  },
  transfer: {
    receiving: '正在接收 {{name}}',
    sizeFrom: '{{size}}，来自 {{name}}',
    fileTo: '发送给 {{name}} 的文件',
    textTo: '发送给 {{name}} 的文本',
    fileFrom: '来自 {{name}} 的文件',
    textFrom: '来自 {{name}} 的文本'
  },
  browser: {
    browser: '浏览器',
    on: '·'
  },
  diagnostics: {
    eyebrow: '连接诊断',
    title: '连接健康',
    signal: '信令',
    p2p: '点对点链路',
    ice: 'ICE/TURN',
    reconnect: '刷新连接',
    noRecentIssue: '暂无近期连接问题。',
    p2pWaiting: '等待另一台设备',
    p2pSummary: '{{ready}} 个就绪 / {{total}} 台设备',
    peerDetails: '对端连接详情',
    peerState: 'WebRTC {{connection}} · ICE {{ice}} · 通道 {{channel}}',
    privacy: '文件和文本直接在浏览器之间传输。Cloudflare 只处理信令和临时 TURN 凭证。',
    turnFallbackTitle: 'TURN 未启用',
    turnFallbackIssue: '当前使用 STUN 回退。远距离或复杂网络可能需要 Cloudflare TURN。',
    signalErrorIssue: '信令连接失败，请检查网络或重新连接。',
    channelErrorIssue: '与 {{name}} 的数据通道报告错误。',
    peerFailedIssue: '与 {{name}} 的点对点连接失败，可能需要 TURN。',
    iceFailedTitle: 'ICE 失败',
    iceFailedIssue: '与 {{name}} 的 ICE 协商失败，请尝试配置 Cloudflare TURN。',
    iceDisconnectedIssue: '与 {{name}} 的 ICE 连接已中断。',
    signalState: {
      connecting: '连接中',
      connected: '已连接',
      disconnected: '已断开'
    },
    iceSource: {
      loading: '检查中',
      fallback: 'STUN 回退',
      'cloudflare-turn': 'Cloudflare TURN'
    }
  }
};

export const dictionaries: Record<Locale, typeof en> = { en, zh };
