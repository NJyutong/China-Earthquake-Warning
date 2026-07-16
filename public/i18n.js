(function () {
  'use strict';

  const STORAGE_KEY = 'quakeLanguage';
  const supported = new Set(['zh-CN', 'en']);
  const requested = new URLSearchParams(window.location.search).get('lang');
  let stored = '';
  try {
    stored = window.localStorage.getItem(STORAGE_KEY) || '';
  } catch (_error) {
    stored = '';
  }
  const browserDefault = String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
  let language = supported.has(requested) ? requested : supported.has(stored) ? stored : browserDefault;
  document.documentElement.lang = language;
  const translatableAttributes = ['aria-label', 'title', 'placeholder'];
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const pendingTextWrites = new WeakMap();
  const pendingAttributeWrites = new WeakMap();

  const exact = {
    '地震数据监控': 'Earthquake Data Monitor',
    '国家地震速报监控': 'National Earthquake Monitor',
    '实时监控': 'Live monitoring',
    '正在连接服务器中': 'Connecting to server',
    '正在连接服务器': 'Connecting to server',
    '服务器已连接': 'Server connected',
    '实时通道已连接': 'Live channel connected',
    '实时通道正在连接': 'Live channel connecting',
    '实时通道未连接': 'Live channel not connected',
    '实时通道已断开': 'Live channel disconnected',
    '信源状态载入中': 'Loading source status',
    '等待更新': 'Waiting for update',
    '等待服务器返回地震数据': 'Waiting for earthquake data from server',
    '正在获取历史数据与实时信源状态': 'Loading earthquake history and live source status',
    '信源连接状态': 'Source connection status',
    '实时信源': 'Live sources',
    '连接中': 'Connecting',
    '已连接': 'Connected',
    '重连中': 'Reconnecting',
    '异常': 'Error',
    '未启用': 'Disabled',
    '当前最新': 'Latest event',
    '震级': 'Magnitude',
    '距关注地': 'Distance to saved location',
    '预估烈度': 'Estimated intensity',
    '震中定位': 'Epicenter location',
    '实时地图': 'Live map',
    '天地图 token': 'Tianditu token',
    '应用': 'Apply',
    '震中': 'Epicenter',
    '我的': 'My location',
    '地图加载中': 'Loading map',
    '正在连接地图服务': 'Connecting to map service',
    '震源坐标': 'Epicenter coordinates',
    '传播半径': 'Propagation radius',
    '地震数据返回后将在此显示': 'Earthquake details will appear here when data is received',
    '纵波 P': 'P wave',
    '横波 S': 'S wave',
    '纵波(P)': 'P wave',
    '横波(S)': 'S wave',
    '发震时间': 'Origin time',
    '接收时间': 'Received time',
    '数据来源': 'Data source',
    '合并信源': 'Merged sources',
    '事件 ID': 'Event ID',
    '处置建议': 'Safety guidance',
    '最近 30 次': 'Latest 30 events',
    '地震列表': 'Earthquake list',
    '历史地震': 'Earthquake history',
    '点击查看详情': 'Select an event for details',
    '输出与控制': 'Output and controls',
    '设置中心': 'Settings',
    '打开设置中心': 'Open settings',
    '网页控制': 'Web controls',
    '设置菜单': 'Settings menu',
    '关闭': 'Close',
    '运行控制': 'Runtime controls',
    '后台推送': 'Background push',
    '后台推送未开启': 'Background push is disabled',
    '语音播报': 'Voice alerts',
    '语音播报未开启': 'Voice alerts are disabled',
    '地震语音播报已开启': 'Voice earthquake alerts are enabled',
    '当前浏览器不支持语音播报': 'This browser does not support voice alerts',
    '推送条件': 'Push conditions',
    '仅当震级达到阈值并匹配所选地区时发送系统通知': 'Send a system notification only when magnitude and area conditions match',
    '提醒震级阈值': 'Magnitude threshold',
    '推送国家': 'Push country',
    '推送区域': 'Push region',
    '推送省份': 'Push province',
    '推送城市': 'Push city',
    '推送区县': 'Push district',
    '国家/地区': 'Country / Region',
    '区域': 'Area',
    '数据接收': 'Data reception',
    '数据源状态': 'Data source status',
    '调试工具': 'Debug tools',
    '调试模式': 'Debug mode',
    '打开调试工具': 'Open debug tools',
    '调试模式关闭': 'Debug mode is off',
    '已开启': 'Enabled',
    '测试地震推送': 'Push test earthquake',
    '测试 Cookie 提示': 'Test cookie notice',
    'Cookie 提示': 'Cookie notice',
    '测试本机通知': 'Test system notification',
    '测试后台推送': 'Test background push',
    '关闭调试模式': 'Exit debug mode',
    '测试地震、Cookie 提示和通知测试会在输入调试密码后显示。': 'Enter the debug password to access test events, cookie notices, and notification tests.',
    '提示': 'Notice',
    '请稍后重试。': 'Please try again later.',
    '知道了': 'Got it',
    '用于本机验证历史地震、Cookie 提示栏和调试密码，不会触发真实播报。': 'For local testing of history, cookie notices, and debug access. It does not trigger a real alert.',
    '用于本机验证测试地震、Cookie 提示栏和调试密码，不会触发真实播报。': 'For local testing of earthquake events, cookie notices, and debug access. It does not trigger a real alert.',
    '调试密码': 'Debug password',
    '取消': 'Cancel',
    '进入调试': 'Enter debug mode',
    '修改调试密码': 'Change debug password',
    '需要先验证当前密码。新密码会保存到服务器配置中。': 'Verify the current password first. The new password is saved in the server configuration.',
    '原密码': 'Current password',
    '新密码': 'New password',
    '新密码要求': 'New password requirements',
    '8 至 128 位': '8 to 128 characters',
    '至少 1 个大写字母': 'At least 1 uppercase letter',
    '至少 1 个数字': 'At least 1 number',
    '至少 1 个特殊符号，例如 @': 'At least 1 special character, such as @',
    '返回': 'Back',
    '保存新密码': 'Save new password',
    '当前关注': 'Current location',
    '等待定位': 'Waiting for location',
    '自动使用设备定位估算 P/S 波到达时间与本地烈度': 'Device location is used to estimate P/S wave arrival and local intensity',
    '中国地震台网正式测定': 'Official CENC report',
    '橙色关注': 'Elevated attention',
    '本地烈度': 'Local intensity',
    '震源深度': 'Focal depth',
    '震中距离': 'Epicentral distance',
    '已到达': 'Arrived',
    '已结束': 'Ended',
    '请注意防护，远离玻璃和悬挂物，确认周围环境安全。': 'Take precautions. Stay away from glass and suspended objects, and check your surroundings.',
    '深度': 'Depth',
    '经纬度': 'Coordinates',
    '提前时间': 'Lead time',
    '震中距您': 'Distance from you',
    '波及范围': 'Affected area',
    '实时公开数据聚合': 'Live public data aggregation',
    '中国地震数据监控': 'China Earthquake Monitoring',
    '等待数据': 'Waiting for data',
    '暂无地震事件': 'No earthquake event',
    '预计到达': 'Estimated arrival',
    '倒计时为估算，仅供展示': 'Arrival time is an estimate for display only',
    '未知': 'Unknown',
    '暂无事件，等待实时数据接入。': 'No events. Waiting for live data.',
    '加载失败': 'Load failed',
    '地图源未配置': 'Map source is not configured',
    '请输入天地图 token 后重试': 'Enter a Tianditu token and try again',
    '请输入天地图 token': 'Enter a Tianditu token',
    '暂无可用地图源': 'No map source is currently available',
    '仅向俄罗斯 IP 开放': 'Available only to Russian IP addresses',
    '今日 100 次额度已用完': 'Today’s 100-use quota is exhausted',
    'Yandex 今日 100 次额度已用完，已自动切换到 Google 地图': 'Yandex’s daily quota of 100 is exhausted. Switched to Google Maps.',
    '输入 token 后应用': 'Enter token and apply',
    '输入 token': 'Enter token',
    '颜色方案': 'Color scheme',
    '切换浅色和深色': 'Toggle light and dark mode',
    '切换语言': 'Switch language',
    '打开设置菜单': 'Open settings menu',
    '当前关注地址，点击重新定位': 'Current saved location. Select to locate again.',
    '最新地震信息': 'Latest earthquake information',
    '震中地图和详情': 'Epicenter map and details',
    '地图源选择': 'Map source selection',
    '地图定位': 'Map focus controls',
    '放大 Google 地图': 'Zoom in Google Maps',
    '缩小 Google 地图': 'Zoom out Google Maps',
    '当前区域暂无地震事件': 'No earthquake events in the selected area',
    '当前区域暂无地震记录': 'No earthquake records in the selected area',
    '正在获取服务器数据': 'Loading server data',
    '等待数据源返回': 'Waiting for data sources',
    '等待实时数据或服务器历史缓存。': 'Waiting for live data or the server history cache.',
    '服务器缓存更新后会自动显示最近地震。': 'Recent earthquakes will appear when the server cache updates.',
    '当前区域暂无地震记录，等待历史缓存或实时数据接入。': 'No earthquake records in this area. Waiting for cached or live data.',
    '当前国家/地区暂无历史地震，正在等待数据源返回。': 'No historical earthquakes are available for this country or region. Waiting for data sources.',
    '历史接口暂不可用，保留已接收的实时和缓存事件。': 'The history service is temporarily unavailable. Live and cached events remain available.',
    '暂时无法刷新历史地震': 'Unable to refresh earthquake history',
    '深度 --': 'Depth --',
    '倒计时为估算': 'Countdowns are estimates',
    '点击获取定位': 'Select to set location',
    '点击重新定位': 'Select to locate again',
    '定位中': 'Locating',
    '定位已设置': 'Location saved',
    '浏览器定位': 'Browser location',
    '市政府位置': 'City center',
    '本地位置': 'Local position',
    '用户位置': 'User location',
    '未知震中': 'Unknown epicenter',
    '传播半径估算中': 'Estimating propagation radius',
    '当前事件缺少震中坐标': 'Epicenter coordinates are missing for this event',
    '地图已加载': 'Map loaded',
    '地图适配器未加载': 'Map adapter is unavailable',
    '地图适配器未加载，请刷新页面重试': 'Map adapter is unavailable. Refresh the page and try again.',
    '地图适配器未加载，请刷新页面': 'Map adapter is unavailable. Refresh the page.',
    '暂无可用地图源，请检查地图配置': 'No map source is available. Check the map configuration.',
    '地图服务暂时不可用，请稍后重试': 'The map service is temporarily unavailable. Try again later.',
    '地图服务暂时不可用': 'The map service is temporarily unavailable',
    '地图加载失败': 'Map failed to load',
    '地图尚未加载完成，请稍后重试': 'The map is still loading. Try again shortly.',
    '定位成功，已将您的位置移到地图中心': 'Location found and centered on the map.',
    '未获得精确定位权限，已显示估算位置': 'Precise location was unavailable. Showing an estimated location.',
    '无法获取您的位置，请检查浏览器定位权限': 'Unable to get your location. Check browser location permission.',
    '已将震中移到地图中心': 'Epicenter centered on the map.',
    '地图设置已保存': 'Map settings saved',
    '使用 Google Maps 分享嵌入模式': 'Using Google Maps share embed mode',
    '需要天地图 token': 'A Tianditu token is required',
    '未配置 AMAP_JS_KEY': 'AMAP_JS_KEY is not configured',
    '未配置 YANDEX_MAPS_API_KEY': 'YANDEX_MAPS_API_KEY is not configured',
    '未知地图源': 'Unknown map source',
    '地图容器不存在': 'Map container is unavailable',
    '官方 SDK 未返回可用对象': 'The official SDK did not return a usable map object',
    '官方 SDK 请求失败': 'The official SDK request failed',
    '官方 SDK 初始化超时': 'The official SDK timed out during initialization',
    '地图画布未完成渲染': 'The map canvas did not finish rendering',
    '连接异常': 'Connection error',
    '暂时无法获取地震数据': 'Earthquake data is temporarily unavailable',
    '数据接口暂时不可用，正在等待实时通道恢复。': 'The data service is temporarily unavailable. Waiting for the live channel to recover.',
    '暂无真实地震事件，等待历史或实时数据接入。': 'No verified earthquake events. Waiting for historical or live data.',
    '实时通道异常': 'Live channel error',
    '实时通道重连中': 'Reconnecting live channel',
    '数据异常': 'Data error',
    '已关闭': 'Closed',
    '待确认': 'Pending',
    '接口异常': 'Service error',
    '暂无记录': 'No records',
    '震级未知': 'Magnitude unknown',
    '-- 级': '--',
    '微震': 'Microearthquake',
    '弱震': 'Minor earthquake',
    '有感地震': 'Felt earthquake',
    '中等地震': 'Moderate earthquake',
    '强震': 'Strong earthquake',
    '大地震': 'Major earthquake',
    '巨大地震': 'Great earthquake',
    '低强度记录，继续监控后续数据': 'Low-intensity event. Continue monitoring for updates.',
    '注意避险，远离玻璃、外墙和悬挂物': 'Take protective action. Stay away from glass, exterior walls, and suspended objects.',
    '保持关注，留意后续正式测定': 'Stay alert and monitor subsequent official reports.',
    '历史记录仅用于查看，不触发警报。': 'Historical records are for reference only and do not trigger alerts.',
    '请立即远离玻璃、悬挂物和危险结构，优先保护头部并就近避险。': 'Move away from glass, suspended objects, and unsafe structures. Protect your head and take shelter nearby.',
    '请注意周围环境，远离易坠落物，保持通讯畅通。': 'Be aware of your surroundings, avoid falling objects, and keep communications available.',
    '本地影响较弱，继续保持监控。': 'Local impact is low. Continue monitoring.',
    '继续监控当前区域地震信息。': 'Continue monitoring earthquake information for this area.',
    '后台推送仅支持 HTTPS': 'Background push requires HTTPS',
    '当前浏览器不支持后台推送': 'This browser does not support background push',
    '后台系统推送已开启': 'Background system push is enabled',
    '后台推送连接待恢复，将在网络恢复后自动重试': 'Background push will reconnect automatically when the network recovers',
    '推送条件待同步，将在网络恢复后自动重试': 'Push conditions will sync automatically when the network recovers',
    '通知权限已被浏览器阻止': 'Notification permission is blocked by the browser',
    '当前手机浏览器不支持后台推送': 'This mobile browser does not support background push',
    'iPhone/iPad 需先将本站添加到主屏幕，再从主屏幕打开并开启后台推送': 'On iPhone or iPad, add this site to the Home Screen, then open it there to enable background push',
    '后台推送仅在 HTTPS 页面可用，请通过 HTTPS 地址重新打开本站。': 'Background push is available only over HTTPS. Reopen this site using its HTTPS address.',
    '当前浏览器不支持 Service Worker 或 Push API，无法启用后台推送。': 'This browser does not support Service Worker or Push API, so background push cannot be enabled.',
    '浏览器没有授予通知权限。请在地址栏左侧的网站权限中允许“通知”，然后重新开启后台推送。': 'Notification permission was not granted. Allow notifications in the site permissions, then enable background push again.',
    '后台推送仅在 HTTPS 页面可用。': 'Background push is available only over HTTPS.',
    '当前浏览器不支持关闭网页后的后台推送。': 'This browser does not support background push after the page is closed.',
    '服务端后台推送未就绪，请联系管理员检查 VAPID 配置。': 'Server push is not ready. Ask the administrator to check the VAPID configuration.',
    '后台推送订阅未被服务端接受。': 'The server did not accept the push subscription.',
    '通知权限已被浏览器阻止，请在网站权限中允许通知后重试。': 'Notifications are blocked. Allow them in the site permissions and try again.',
    '浏览器中的旧推送订阅状态无效，请刷新页面后重新开启。': 'The previous push subscription is invalid. Refresh the page and enable push again.',
    '浏览器推送服务暂时不可达，请稍后重试。': 'The browser push service is temporarily unreachable. Try again later.',
    '后台推送订阅失败，请检查 HTTPS 证书、浏览器通知权限和服务器 VAPID 配置。': 'Push subscription failed. Check the HTTPS certificate, browser notification permission, and server VAPID configuration.',
    '浏览器推送订阅未能同步到服务器，请关闭后台推送后重新开启。': 'The browser subscription could not be synchronized with the server. Disable and re-enable background push.',
    '未找到当前浏览器的后台推送订阅，请重新开启后台推送。': 'No background push subscription was found for this browser. Enable it again.',
    '服务端未能发送后台推送测试，请检查推送服务连接。': 'The server could not send the push test. Check the push service connection.',
    '正在发送后台推送测试，请稍候。': 'Sending the background push test. Please wait.',
    '通知测试等待超时，请检查服务器推送日志。': 'The notification test timed out. Check the server push logs.',
    '后台推送测试已提交，请查看电脑系统通知。': 'The push test was submitted. Check the system notifications.',
    '后台推送测试失败，请检查 HTTPS、服务器网络和浏览器通知权限。': 'The push test failed. Check HTTPS, server connectivity, and browser notification permission.',
    '本机通知测试': 'System notification test',
    '后台推送测试': 'Background push test',
    '当前没有可发送的地震信息。': 'There is no earthquake information to send.',
    '当前设备已确认收到并创建所选地震的系统通知。': 'This device confirmed receipt and created the system notification for the selected earthquake.',
    '当前设备已确认收到并创建新的测试系统通知。': 'This device confirmed receipt and created the new test system notification.',
    '当前设备已确认收到并显示通知。': 'This device confirmed receipt and created the notification.',
    '当前设备已确认收到通知，正在等待推送服务完成响应。': 'This device confirmed receipt and is waiting for the push service response.',
    '推送已到达浏览器，Service Worker 已确认创建通知对象。操作系统是否弹出横幅取决于系统通知设置。': 'The push reached the browser and the Service Worker confirmed that it created a notification object. Whether the operating system shows a banner depends on system notification settings.',
    '浏览器已创建通知对象，正在等待推送服务完成响应。': 'The browser created the notification object and is waiting for the push service response.',
    '推送服务已完成发送，但浏览器未返回通知对象校验结果。请打开设备通知中心确认。': 'The push service completed delivery, but the browser did not return notification-object verification. Open the device notification center to confirm.',
    '推送已到达 Edge，Service Worker 已确认创建独立的系统通知。若未看到横幅，请按 Win+N 检查通知中心，并在 Windows“设置 > 系统 > 通知 > Microsoft Edge”中开启通知横幅和声音，同时关闭“请勿打扰”。': 'The push reached Edge and the Service Worker confirmed creation of a unique system notification. If no banner appears, press Win+N to check Notification Center, enable notification banners and sound under Windows Settings > System > Notifications > Microsoft Edge, and turn off Do not disturb.',
    '推送已到达浏览器，Service Worker 已确认创建系统通知。若未看到横幅，请检查设备的应用通知、通知中心和勿扰模式。': 'The push reached the browser and the Service Worker confirmed creation of a system notification. If no banner appears, check app notifications, Notification Center, and Do Not Disturb on the device.',
    '推送已到达手机并创建系统通知，网页已请求高紧急度、声音与振动。若通知只停留在状态栏，请在系统通知设置中把当前浏览器的网站通知渠道设为“紧急”或允许“在屏幕上弹出”，并关闭勿扰和省电限制。': 'The push reached the phone and created a system notification with high urgency, sound, and vibration requested. If it only appears in the status bar, set this browser’s website-notification channel to Urgent or allow pop-up display, then disable Do Not Disturb and battery restrictions.',
    '推送仍由旧版 Edge 通道接收。请强制刷新页面一次，网页会自动迁移到独立桌面推送通道，然后重新测试。': 'The push is still using the legacy Edge channel. Force-refresh the page once so it can migrate to the dedicated desktop push channel, then test again.',
    '推送已到达 Edge 的独立桌面通道，Service Worker 已确认创建系统通知。若仍未看到横幅，请按 Win+N 检查通知中心，并确认 Windows 的 Microsoft Edge 通知横幅、声音和“请勿打扰”设置。': 'The push reached Edge through the dedicated desktop channel, and the Service Worker confirmed creation of a system notification. If no banner appears, press Win+N and verify Microsoft Edge banners, sound, and Do Not Disturb in Windows notification settings.',
    '推送服务未接受该测试消息，设备回执不能覆盖失败结果': 'The push service did not accept this test message, so a device acknowledgement cannot override the failed result.',
    '浏览器推送服务已接受消息，正在等待当前设备确认。': 'The browser push service accepted the message and is waiting for this device to confirm receipt.',
    '推送服务已接受消息，但当前设备未确认显示通知。请检查浏览器后台运行权限、系统通知设置和专注模式后重试。': 'The push service accepted the message, but this device did not confirm notification creation. Check browser background permission, system notification settings, and focus mode, then try again.',
    '本机通知仅能在 HTTPS 页面中测试。': 'System notifications can only be tested on an HTTPS page.',
    '当前浏览器不支持系统通知或 Service Worker。': 'This browser does not support system notifications or Service Worker.',
    '浏览器没有授予通知权限，请在网站权限中允许通知后重试。': 'Notification permission was not granted. Allow notifications in the site permissions and try again.',
    '测试地震已添加 · 设备推送已发送': 'Test earthquake added · Device push sent',
    '测试地震已添加 · 设备推送失败': 'Test earthquake added · Device push failed',
    '测试地震已添加，设备推送已发送': 'Test earthquake added; device push sent',
    '测试地震已添加，设备推送失败': 'Test earthquake added; device push failed',
    '浏览器推送组件未加载，请强制刷新页面后重试。': 'The browser push component did not load. Force-refresh the page and try again.',
    '3 级及以上': 'Magnitude 3+',
    '4 级及以上': 'Magnitude 4+',
    '5 级及以上': 'Magnitude 5+',
    '6 级及以上': 'Magnitude 6+',
    '本机通知发送失败，请检查 HTTPS、浏览器通知权限和系统通知设置。': 'The system notification failed. Check HTTPS, browser permission, and operating-system notification settings.',
    'Cloudflare 推送中继拒绝了请求，请确认 Worker 与服务器使用相同的 PUSH_RELAY_SECRET。': 'The Cloudflare push relay rejected the request. Confirm that the Worker and server use the same PUSH_RELAY_SECRET.',
    '密码错误，请重新输入。': 'Incorrect password. Try again.',
    '请输入调试密码。': 'Enter the debug password.',
    '暂时无法开启调试模式，请稍后再试。': 'Debug mode is temporarily unavailable. Try again later.',
    '暂时无法开启调试模式。': 'Debug mode is temporarily unavailable.',
    '请填写原密码和新密码。': 'Enter the current and new passwords.',
    '新密码需要 8 至 128 位。': 'The new password must contain 8 to 128 characters.',
    '新密码还需要：至少 1 个大写字母。': 'The new password still needs at least 1 uppercase letter.',
    '新密码还需要：至少 1 个数字。': 'The new password still needs at least 1 number.',
    '新密码还需要：至少 1 个特殊符号（例如 @）。': 'The new password still needs at least 1 special character, such as @.',
    '原密码不正确，请重新输入。': 'The current password is incorrect. Try again.',
    '原密码不正确。': 'The current password is incorrect.',
    '调试密码已更新。': 'The debug password was updated.',
    '暂时无法修改调试密码，请稍后再试。': 'The debug password cannot be changed right now. Try again later.',
    '暂时无法修改调试密码。': 'The debug password cannot be changed right now.',
    '调试模式开启': 'Debug mode is on',
    '调试模式已开启': 'Debug mode enabled',
    '调试模式已关闭': 'Debug mode disabled',
    '退出调试': 'Exit debug mode',
    '已显示 Cookie 提示栏': 'Cookie notice displayed',
    '当前浏览器暂时无法显示 Cookie 提示栏。': 'The Cookie notice cannot be displayed in this browser right now.',
    '当前浏览器不支持 Cookie 设置面板': 'This browser does not support the Cookie settings panel',
    '已添加测试地震': 'Test earthquake added',
    '已添加测试地震并发送设备通知': 'Test earthquake added and device notification sent',
    '已添加测试地震，设备通知失败': 'Test earthquake added, but the device notification failed',
    '测试地震已显示，但设备通知发送失败。': 'The test earthquake is visible, but the device notification could not be sent.',
    '本地 Cookie 选择': 'Local Cookie choices',
    '本地 Cookie 使用说明': 'Local Cookie notice',
    '地震数据监控仅用必要 Cookie 记录您的 Cookie 选择和导览状态；系统推送设置、地图源、主题和关注地区保存在浏览器本机加密存储中，不会随每次请求发送。本站不使用广告、营销或第三方分析 Cookie，不保存明文定位信息。清除站点数据后，网页会按新用户重新开始。': 'Earthquake Monitoring uses necessary Cookies only for your Cookie choice and onboarding status. Push settings, map source, theme, and saved area are encrypted in local browser storage and are not sent with every request. The site uses no advertising, marketing, or third-party analytics Cookies and stores no plaintext location data. Clearing site data resets the page for a new user.',
    '管理设置': 'Manage settings',
    '拒绝可选': 'Reject optional',
    '全部接受': 'Accept all',
    'Cookie 管理设置': 'Cookie settings',
    '这里只显示本项目实际使用的 Cookie 和本机存储类型。您可以关闭本机功能存储，关闭后页面仍可使用，但地图源、主题和关注地区不会在下次打开时保留。': 'Only Cookies and local storage actually used by this site are shown. You can disable local preference storage; the page will continue to work, but map, theme, and saved area preferences will not persist.',
    '展开必要 Cookie 说明': 'Expand necessary Cookie details',
    '必要 Cookie': 'Necessary Cookies',
    '仅用于保存您对 Cookie 的选择和首次导览状态。该项始终启用，清除 Cookie 后会重新询问。': 'Stores only your Cookie choice and onboarding status. It is always enabled and will be requested again after Cookies are cleared.',
    '始终启用': 'Always enabled',
    '展开本机功能 Cookie 说明': 'Expand local preference storage details',
    '本机功能存储': 'Local preference storage',
    '用于加密保存地图源、主题模式、关注地区等偏好，数据保存在本机，不进入请求头。': 'Encrypts map source, theme, saved area, and similar preferences locally. The data is not added to request headers.',
    '全部拒绝': 'Reject all',
    '保存并接受': 'Save and accept',
    '功能导览': 'Feature tour',
    '震中地图': 'Epicenter map',
    '显示震中位置和地震波范围。': 'Shows the epicenter and estimated seismic-wave range.',
    '地震详情': 'Earthquake details',
    '显示震级、预计到达、烈度、发震时间和接收时间。': 'Shows magnitude, estimated arrivals, intensity, origin time, and received time.',
    '显示按时间排序的历史和实时事件。': 'Shows historical and live events ordered by time.',
    '设置': 'Settings',
    '打开地图源、区域筛选、系统推送和调试设置。': 'Opens map source, area filtering, system push, and debug settings.',
    '当前定位': 'Current location',
    '显示用于计算地震波到达时间和本地烈度的所在市区。': 'Shows the location used to estimate seismic-wave arrival times and local intensity.',
    '最新地震': 'Latest earthquake',
    '数据使用声明': 'Data use notice',
    '数据声明': 'Data notice',
    '本页面汇集公共平台与公开信源，数据可能存在延迟、缺失或误差，仅供信息参考，不替代政府部门正式发布及应急指令。': 'This page aggregates public platforms and open data feeds. Information may be delayed, incomplete, or inaccurate and does not replace official government notices or emergency instructions.',
    '显示当前选中地震的震中、震级、本地烈度、深度和预计到达。': 'Shows the selected event’s epicenter, magnitude, local intensity, depth, and estimated arrivals.',
    '查看震中位置、关注地位置、地震波动画和地图源选择。': 'Shows the epicenter, saved location, seismic-wave animation, and map source selection.',
    '显示服务器缓存和实时收到的最近 30 条地震，点击条目查看详情。': 'Shows the latest 30 cached and live events. Select an item for details.',
    '打开国家地区筛选、数据源状态、地图 token 和调试工具。': 'Opens country and area filters, source status, map token, and debug tools.',
    '跳过': 'Skip',
    '下一个': 'Next',
    '完成': 'Done',
    '全部区域': 'All areas',
    '全国': 'Nationwide',
    '全部城市': 'All cities',
    '全部区县': 'All districts',
    '内蒙古呼伦贝尔市牙克石市': 'Yakeshi, Hulunbuir, Inner Mongolia',
    '四川宜宾市高县': 'Gao County, Yibin, Sichuan',
    '新疆阿克苏地区沙雅县': 'Shaya County, Aksu Prefecture, Xinjiang',
    '青海海西州直辖区': 'Haixi Prefecture-administered Area, Qinghai',
    '云南大理州宾川县': 'Binchuan County, Dali Prefecture, Yunnan',
    '新疆喀什地区伽师县': 'Jiashi County, Kashgar Prefecture, Xinjiang',
    '四川德阳市绵竹市': 'Mianzhu, Deyang, Sichuan',
    '新疆伊犁州巩留县': 'Gongliu County, Ili Prefecture, Xinjiang'
  };

  const replacements = [
    ['中华人民共和国', 'China'],
    ['中国地震台网', 'CENC'],
    ['四川甘孜州康定市', 'Kangding, Garze Prefecture, Sichuan'],
    ['云南昭通市鲁甸县', 'Ludian County, Zhaotong, Yunnan'],
    ['青海海北州门源县', 'Menyuan County, Haibei Prefecture, Qinghai'],
    ['新疆阿克苏地区乌什县', 'Wushi County, Aksu Prefecture, Xinjiang'],
    ['西藏日喀则市定日县', 'Dingri County, Shigatse, Tibet'],
    ['内蒙古自治区', 'Inner Mongolia'],
    ['广西壮族自治区', 'Guangxi'],
    ['西藏自治区', 'Tibet'],
    ['宁夏回族自治区', 'Ningxia'],
    ['新疆维吾尔自治区', 'Xinjiang'],
    ['香港特别行政区', 'Hong Kong'],
    ['澳门特别行政区', 'Macao'],
    ['中国台湾', 'Taiwan'],
    ['台湾省', 'Taiwan'],
    ['北京市', 'Beijing'],
    ['天津市', 'Tianjin'],
    ['上海市', 'Shanghai'],
    ['重庆市', 'Chongqing'],
    ['河北省', 'Hebei'],
    ['山西省', 'Shanxi'],
    ['辽宁省', 'Liaoning'],
    ['吉林省', 'Jilin'],
    ['黑龙江省', 'Heilongjiang'],
    ['江苏省', 'Jiangsu'],
    ['浙江省', 'Zhejiang'],
    ['安徽省', 'Anhui'],
    ['福建省', 'Fujian'],
    ['江西省', 'Jiangxi'],
    ['山东省', 'Shandong'],
    ['河南省', 'Henan'],
    ['湖北省', 'Hubei'],
    ['湖南省', 'Hunan'],
    ['广东省', 'Guangdong'],
    ['海南省', 'Hainan'],
    ['四川省', 'Sichuan'],
    ['贵州省', 'Guizhou'],
    ['云南省', 'Yunnan'],
    ['陕西省', 'Shaanxi'],
    ['甘肃省', 'Gansu'],
    ['青海省', 'Qinghai'],
    ['内蒙古', 'Inner Mongolia'],
    ['黑龙江', 'Heilongjiang'],
    ['新疆', 'Xinjiang'],
    ['西藏', 'Tibet'],
    ['宁夏', 'Ningxia'],
    ['广西', 'Guangxi'],
    ['北京', 'Beijing'],
    ['天津', 'Tianjin'],
    ['上海', 'Shanghai'],
    ['重庆', 'Chongqing'],
    ['河北', 'Hebei'],
    ['山西', 'Shanxi'],
    ['辽宁', 'Liaoning'],
    ['吉林', 'Jilin'],
    ['江苏', 'Jiangsu'],
    ['浙江', 'Zhejiang'],
    ['安徽', 'Anhui'],
    ['福建', 'Fujian'],
    ['江西', 'Jiangxi'],
    ['山东', 'Shandong'],
    ['河南', 'Henan'],
    ['湖北', 'Hubei'],
    ['湖南', 'Hunan'],
    ['广东', 'Guangdong'],
    ['海南', 'Hainan'],
    ['四川', 'Sichuan'],
    ['贵州', 'Guizhou'],
    ['云南', 'Yunnan'],
    ['陕西', 'Shaanxi'],
    ['甘肃', 'Gansu'],
    ['青海', 'Qinghai'],
    ['香港', 'Hong Kong'],
    ['澳门', 'Macao'],
    ['台湾', 'Taiwan'],
    ['莫斯科', 'Moscow'],
    ['俄罗斯', 'Russia'],
    ['日本', 'Japan'],
    ['韩国', 'South Korea'],
    ['全球', 'Global'],
    ['海域', ' offshore'],
    ['附近', ' near'],
    ['正式测定', 'official report'],
    ['自动选择', 'Auto'],
    ['高德地图', 'AMap'],
    ['天地图', 'Tianditu'],
    ['本地烈度', 'Local intensity'],
    ['震中烈度', 'Epicentral intensity'],
    ['中低强度', 'low to moderate intensity'],
    ['低强度', 'Low intensity'],
    ['中强度', 'Moderate intensity'],
    ['高强度', 'High intensity'],
    ['强烈', 'Severe intensity'],
    ['严重', 'Very severe intensity'],
    ['极强', 'Extreme intensity'],
    ['巨大地震', 'Great earthquake'],
    ['大地震', 'Major earthquake'],
    ['中等地震', 'Moderate earthquake'],
    ['有感地震', 'Felt earthquake'],
    ['强震', 'Strong earthquake'],
    ['弱震', 'Minor earthquake'],
    ['微震', 'Microearthquake'],
    ['实时信源', 'Live sources'],
    ['调试测试', 'Debug test'],
    ['本地调试', 'Local debug'],
    ['中国', 'China'],
    ['实时', 'Live'],
    ['历史', 'Historical'],
    ['全部', 'All'],
    ['未配置', 'Not configured'],
    ['网络不可达', 'Network unavailable'],
    ['请检查', 'Check'],
    ['请刷新页面', 'Refresh the page'],
    ['稍后重试', 'try again later'],
    ['地图服务', 'map service'],
    ['服务器', 'server'],
    ['连接', 'connection'],
    ['地震', 'earthquake'],
    ['烈度', 'intensity'],
    ['震级', 'magnitude'],
    ['深度', 'depth'],
    ['距离', 'distance'],
    ['来源', 'source'],
    ['测试', 'test'],
    ['通知', 'notification'],
    ['密码', 'password'],
    ['保存', 'Save'],
    ['开启', 'Enable'],
    ['关闭', 'Disable']
  ].sort((left, right) => right[0].length - left[0].length);

  const adminTerms = [
    ['维吾尔自治区', 'Autonomous Region'],
    ['壮族自治区', 'Autonomous Region'],
    ['回族自治区', 'Autonomous Region'],
    ['特别行政区', 'Special Administrative Region'],
    ['藏族自治州', 'Tibetan Autonomous Prefecture'],
    ['回族自治县', 'Hui Autonomous County'],
    ['自治州', 'Autonomous Prefecture'],
    ['自治县', 'Autonomous County'],
    ['自治区', 'Autonomous Region'],
    ['直辖区', 'Prefecture-administered Area'],
    ['地区', 'Prefecture'],
    ['政府', 'Government'],
    ['公里', 'km'],
    ['海域', 'offshore'],
    ['群岛', 'Islands'],
    ['州', 'Prefecture'],
    ['盟', 'League'],
    ['旗', 'Banner'],
    ['市', 'City'],
    ['县', 'County'],
    ['区', 'District'],
    ['乡', 'Township'],
    ['镇', 'Town'],
    ['村', 'Village'],
    ['岛', 'Island']
  ];
  const placeNames = [
    ['呼伦贝尔', 'Hulunbuir'], ['牙克石', 'Yakeshi'], ['阿克苏', 'Aksu'],
    ['喀什', 'Kashgar'], ['伊犁', 'Ili'], ['花莲', 'Hualien'],
    ['秀林', 'Xiulin'], ['丰滨', 'Fengbin'], ['莫斯科', 'Moscow']
  ];
  const directionNames = {
    '北方': 'north', '北北东方': 'north-northeast', '东北方': 'northeast', '东北东方': 'east-northeast',
    '东方': 'east', '东南东方': 'east-southeast', '东南方': 'southeast', '南南东方': 'south-southeast',
    '南方': 'south', '南南西方': 'south-southwest', '西南方': 'southwest', '西南西方': 'west-southwest',
    '西方': 'west', '西北西方': 'west-northwest', '西北方': 'northwest', '北北西方': 'north-northwest'
  };
  const sharedLabelCache = new Map();

  function sharedEnglishLabel(value) {
    if (sharedLabelCache.has(value)) return sharedLabelCache.get(value);
    const shared = window.EarthquakeShared;
    if (!shared || !Array.isArray(shared.AREA_OPTIONS)) return '';
    for (const area of shared.AREA_OPTIONS) {
      if (value === area.label) {
        const alias = (area.aliases || []).find(item => !/[\u3400-\u9fff]/.test(String(item)));
        if (alias) {
          sharedLabelCache.set(value, String(alias));
          return String(alias);
        }
      }
      for (const option of area.regions || []) {
        if (value !== option.label) continue;
        const alias = (option.aliases || []).find(item => !/[\u3400-\u9fff]/.test(String(item)) && !/^all$/i.test(String(item)));
        if (alias) {
          sharedLabelCache.set(value, String(alias));
          return String(alias);
        }
      }
    }
    sharedLabelCache.set(value, '');
    return '';
  }

  function pinyinPlacePart(value) {
    const convert = window.pinyinPro && window.pinyinPro.pinyin;
    if (typeof convert !== 'function') return value;
    const syllables = convert(value, { toneType: 'none', type: 'array' });
    if (!Array.isArray(syllables) || !syllables.length) return value;
    const compact = syllables.join('').replace(/[^A-Za-z0-9'-]+/g, '');
    return compact ? compact.charAt(0).toUpperCase() + compact.slice(1).toLowerCase() : value;
  }

  function translateTaiwanLocation(value) {
    const normalized = value.replace(/臺/g, '台').replace(/蓮/g, '莲').replace(/縣/g, '县').replace(/鄉/g, '乡').replace(/豐/g, '丰').replace(/於/g, '于');
    const directions = Object.keys(directionNames).sort((left, right) => right.length - left.length).join('|');
    const match = normalized.match(new RegExp(`^(.+?)(${directions})\\s*([\\d.]+)\\s*公里\\s*[（(]位于(.+?)[）)]$`));
    if (!match) return '';
    return `${match[3]} km ${directionNames[match[2]]} of ${translatePlaceName(match[1])} (${translatePlaceName(match[4])})`;
  }

  function translatePlaceName(value) {
    let text = String(value || '').replace(/臺/g, '台').replace(/蓮/g, '莲').replace(/縣/g, '县').replace(/鄉/g, '乡').replace(/豐/g, '丰');
    const taiwan = translateTaiwanLocation(text);
    if (taiwan) return taiwan;
    for (const [from, to] of placeNames) text = text.split(from).join(` ${to} `);
    for (const [from, to] of adminTerms) {
      text = from === '州'
        ? text.replace(/州(?!市)/g, ` ${to} `)
        : text.split(from).join(` ${to} `);
    }
    text = text.replace(/[\u3400-\u9fff]+/g, part => ` ${pinyinPlacePart(part)} `);
    return text
      .replace(/\s+([,.)])/g, '$1')
      .replace(/([(])\s+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  function looksLikePlaceName(value) {
    if (!/[\u3400-\u9fff]/.test(value) || /[。；！？：]/.test(value) || value.length > 80) return false;
    return /[省市县区州旗乡镇村盟岛]|海域|群岛|地区|公里|位[于於]/.test(value);
  }

  function translate(value) {
    if (language !== 'en' || value === null || value === undefined) return String(value ?? '');
    const source = String(value);
    const leading = source.match(/^\s*/)[0];
    const trailing = source.match(/\s*$/)[0];
    let text = source.trim();
    if (!text) return source;
    if (exact[text]) return leading + exact[text] + trailing;
    const sharedLabel = sharedEnglishLabel(text);
    if (sharedLabel) return leading + sharedLabel + trailing;

    const patterns = [
      [/^正在加载(.+)官方地图$/, (_match, provider) => `Loading official ${translate(provider)} map`],
      [/^切换到(.+)$/, (_match, provider) => `Switch to ${translate(provider)}`],
      [/^今日已用\s*(\d+)\/(\d+)$/, (_match, used, limit) => `Used today ${used}/${limit}`],
      [/^信源在线\s*(\d+)\/(\d+)$/, (_match, connected, total) => `Sources online ${connected}/${total}`],
      [/^(\d+)\/(\d+)\s*在线$/, (_match, connected, total) => `${connected}/${total} online`],
      [/^(\d+(?:\.\d+)?)\s*级及以上$/, (_match, magnitude) => `M${magnitude} and above`],
      [/^(.+?)\s*·\s*(\d+(?:\.\d+)?)\s*级$/, (_match, place, magnitude) => `${translate(place)} · M${magnitude}`],
      [/^(\d+(?:\.\d+)?)\s*级$/, (_match, magnitude) => `M${magnitude}`],
      [/^(\d+)\s*秒$/, (_match, seconds) => `${seconds} s`],
      [/^深度\s*(--|\d+(?:\.\d+)?\s*km)$/, (_match, depth) => `Depth ${depth}`],
      [/^距关注地\s*(\d+(?:\.\d+)?)\s*km$/, (_match, distance) => `${distance} km from saved location`],
      [/^距您\s*(\d+(?:\.\d+)?)\s*km$/, (_match, distance) => `${distance} km from you`],
      [/^(.+?)\s+(\d+(?:\.\d+)?)\s*级地震$/, (_match, place, magnitude) => `M${magnitude} earthquake — ${translate(place)}`],
      [/^(\d+(?:\.\d+)?)级\s*\/\s*(.+)$/, (_match, magnitude, detail) => `M${magnitude} / ${translate(detail)}`],
      [/^烈度\s*(.+)$/, (_match, level) => `Intensity ${translate(level)}`],
      [/^本地烈度\s*(.+)$/, (_match, level) => `Local intensity ${translate(level)}`],
      [/^震中烈度\s*(.+)$/, (_match, level) => `Epicentral intensity ${translate(level)}`],
      [/^(\d+)\s*低强度$/, (_match, level) => `${level} Low intensity`],
      [/^(\d+)\s*中低强度$/, (_match, level) => `${level} Low to moderate intensity`],
      [/^(\d+)\s*中强度$/, (_match, level) => `${level} Moderate intensity`],
      [/^(\d+)\s*强烈$/, (_match, level) => `${level} Severe intensity`],
      [/^(\d+)\s*严重$/, (_match, level) => `${level} Very severe intensity`],
      [/^(\d+)\s*极强$/, (_match, level) => `${level} Extreme intensity`],
      [/^地图：(.+)$/, (_match, provider) => `Map: ${translate(provider)}`],
      [/^(.+)加载失败：(.+)$/, (_match, provider, reason) => `${translate(provider)} failed to load: ${translate(reason)}`],
      [/^(.+)授权失败（HTTP\s*(\d+)）$/, (_match, provider, status) => `${translate(provider)} authorization failed (HTTP ${status})`],
      [/^服务器无法直连 (.+?)（(.+?):443）。这是服务器出站网络问题，不是浏览器通知权限；请放行该域名，或配置 PUSH_PROXY_URL \/ Cloudflare 推送中继。$/, (_match, provider, host) => `The server cannot connect directly to ${provider} (${host}:443). This is an outbound server network issue, not a browser permission issue. Allow the host or configure PUSH_PROXY_URL / the Cloudflare push relay.`],
      [/^服务器通过 PUSH_PROXY_URL 仍无法连接 (.+?)，请检查代理出站规则及 (.+?):443。$/, (_match, provider, host) => `The server still cannot reach ${provider} through PUSH_PROXY_URL. Check the proxy outbound rules for ${host}:443.`],
      [/^服务器无法连接已配置的 Cloudflare 推送中继（(.+?)），请检查运行中服务的 PUSH_RELAY_URL、DNS 和 Worker 路由。目标推送服务为 (.+?)。$/, (_match, host, provider) => `The server cannot reach its configured Cloudflare push relay (${host}). Check the running service's PUSH_RELAY_URL, DNS, and Worker route. Target push service: ${provider}.`],
      [/^Cloudflare 推送中继拒绝了请求，请确认 Worker 与服务器使用相同的 PUSH_RELAY_SECRET。(?: 诊断编号：([0-9a-f-]+)。)?$/i, (_match, diagnosticId) => `The Cloudflare push relay rejected the request. Confirm that the Worker and server use the same PUSH_RELAY_SECRET.${diagnosticId ? ` Diagnostic ID: ${diagnosticId}.` : ''}`],
      [/^Cloudflare 推送中继无法连接 (.+?)（(.+?):443），请检查 Worker 出站状态。(?: 诊断编号：([0-9a-f-]+)。)?$/i, (_match, provider, host, diagnosticId) => `The Cloudflare push relay cannot reach ${provider} (${host}:443). Check Worker outbound connectivity.${diagnosticId ? ` Diagnostic ID: ${diagnosticId}.` : ''}`],
      [/^Cloudflare 推送中继返回异常(?:（HTTP (\d+)）)?，请检查 Worker 路由、WAF 和服务日志。(?: 诊断编号：([0-9a-f-]+)。)?$/i, (_match, status, diagnosticId) => `The Cloudflare push relay returned an error${status ? ` (HTTP ${status})` : ''}. Check the Worker route, WAF, and service logs.${diagnosticId ? ` Diagnostic ID: ${diagnosticId}.` : ''}`],
      [/^PUSH_RELAY_URL 必须是公网 HTTPS 地址，PUSH_RELAY_SECRET 必须为 32 至 256 位随机字符串$/, () => 'PUSH_RELAY_URL must be a public HTTPS URL and PUSH_RELAY_SECRET must contain 32 to 256 random characters.'],
      [/^(.+?) 必须是有效的 HTTP 或 HTTPS 代理地址$/, (_match, key) => `${key} must be a valid HTTP or HTTPS proxy URL.`]
    ];
    for (const [pattern, formatter] of patterns) {
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        return leading + text.replace(pattern, formatter) + trailing;
      }
    }
    for (const [from, to] of replacements) text = text.split(from).join(to);
    if (/[\u3400-\u9fff]/.test(text) && looksLikePlaceName(text)) text = translatePlaceName(text);
    return leading + text + trailing;
  }

  function isSkipped(node) {
    const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    return Boolean(element && element.closest('[data-i18n-skip]'));
  }

  function sourceAttributes(element) {
    let values = attributeSources.get(element);
    if (!values) {
      values = new Map();
      attributeSources.set(element, values);
    }
    return values;
  }

  function pendingAttributes(element) {
    let values = pendingAttributeWrites.get(element);
    if (!values) {
      values = new Map();
      pendingAttributeWrites.set(element, values);
    }
    return values;
  }

  function renderTextNode(node) {
    if (!textSources.has(node) || isSkipped(node)) return;
    const source = textSources.get(node);
    const next = language === 'en' ? translate(source) : source;
    if (node.nodeValue === next) return;
    pendingTextWrites.set(node, next);
    node.nodeValue = next;
  }

  function renderAttribute(element, name) {
    const sources = attributeSources.get(element);
    if (!sources || !sources.has(name) || isSkipped(element)) return;
    const source = sources.get(name);
    const next = language === 'en' ? translate(source) : source;
    if (element.getAttribute(name) === next) return;
    pendingAttributes(element).set(name, next);
    element.setAttribute(name, next);
  }

  function captureTree(node) {
    if (!node || isSkipped(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!textSources.has(node)) textSources.set(node, node.nodeValue || '');
      renderTextNode(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return;
    const sources = sourceAttributes(node);
    for (const name of translatableAttributes) {
      if (!node.hasAttribute(name)) continue;
      if (!sources.has(name)) sources.set(name, node.getAttribute(name) || '');
      renderAttribute(node, name);
    }
    for (const child of node.childNodes) captureTree(child);
  }

  function updateLanguageControls() {
    document.querySelectorAll('[data-language]').forEach(button => {
      const active = button.dataset.language === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function bindLanguageControls() {
    document.querySelectorAll('[data-language]').forEach(button => {
      if (button.dataset.languageBound === 'true') return;
      button.dataset.languageBound = 'true';
      button.addEventListener('click', () => setLanguage(button.dataset.language));
    });
    updateLanguageControls();
  }

  function updateApiState() {
    window.QuakeI18n.language = language;
    window.QuakeI18n.isEnglish = language === 'en';
  }

  function setLanguage(next) {
    if (!supported.has(next) || next === language) return;
    language = next;
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (_error) {
      // URL state remains available when local storage is blocked.
    }
    const url = new URL(window.location.href);
    if (next === 'zh-CN') url.searchParams.delete('lang');
    else url.searchParams.set('lang', next);
    try {
      window.history.replaceState(window.history.state, '', url.href);
    } catch (_error) {
      // The visible language can still change when history access is restricted.
    }
    captureTree(document.documentElement);
    updateLanguageControls();
    updateApiState();
    window.dispatchEvent(new CustomEvent('quake-language-change', { detail: { language } }));
  }

  function observeDom() {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (isSkipped(record.target)) continue;
          const name = record.attributeName;
          const current = record.target.getAttribute(name);
          const pending = pendingAttributeWrites.get(record.target);
          if (pending && pending.get(name) === current) {
            pending.delete(name);
            continue;
          }
          const sources = sourceAttributes(record.target);
          if (current === null) sources.delete(name);
          else {
            sources.set(name, current);
            renderAttribute(record.target, name);
          }
          continue;
        }
        if (record.type === 'characterData') {
          if (isSkipped(record.target)) continue;
          const current = record.target.nodeValue || '';
          if (pendingTextWrites.get(record.target) === current) {
            pendingTextWrites.delete(record.target);
            continue;
          }
          textSources.set(record.target, current);
          renderTextNode(record.target);
          continue;
        }
        for (const node of record.addedNodes) captureTree(node);
      }
      bindLanguageControls();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatableAttributes
    });
  }

  function start() {
    captureTree(document.documentElement);
    bindLanguageControls();
    observeDom();
  }

  window.QuakeI18n = {
    language,
    isEnglish: language === 'en',
    t: translate,
    setLanguage
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
