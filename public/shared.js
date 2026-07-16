(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EarthquakeShared = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SOURCES = [
    { key: 'cenc_eew', label: 'CENC EEW', url: 'wss://ws-api.wolfx.jp/cenc_eew' },
    { key: 'cenc_eqlist', label: 'CENC EQLIST', url: 'wss://ws-api.wolfx.jp/cenc_eqlist' },
    { key: 'sc_eew', label: '四川 EEW', url: 'wss://ws-api.wolfx.jp/sc_eew' },
    { key: 'cq_eew', label: '重庆 EEW', url: 'wss://ws-api.wolfx.jp/cq_eew' },
    { key: 'fj_eew', label: '福建 EEW', url: 'wss://ws-api.wolfx.jp/fj_eew' },
    { key: 'cwa_taiwan', label: '中国台湾 CWA', url: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/E-A0015-001', type: 'poll' },
    { key: 'cenc_intensity', label: 'CENC 烈度', url: 'wss://api-cencint-public.nowquake.cn/websocket' }
  ];

  const BACKUP_SOURCES = [
    { key: 'usgs_all_day', label: 'USGS 全球', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', type: 'poll' },
    { key: 'emsc_latest', label: 'EMSC 全球', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50&orderby=time', type: 'poll' },
    { key: 'ras_russia', label: 'GS RAS', url: '', type: 'poll' }
  ];

  const ALL_SOURCES = SOURCES.concat(BACKUP_SOURCES);

  const MAP_SOURCES = [
    { key: 'auto', label: '自动选择' },
    { key: 'amap', label: '高德地图' },
    { key: 'tianditu', label: '天地图', needsToken: true },
    { key: 'google', label: 'Google' },
    { key: 'yandex', label: 'Yandex' },
    { key: 'osm', label: 'OSM' },
    { key: 'esri', label: 'Esri' }
  ];
  const AMAP_TILE_URL = 'amap://default';
  const AMAP_SAMPLE_TILE_URL = '';
  const AMAP_ATTRIBUTION = '地图：高德地图';

  const PLACE_EXACT = {
    'MYANMAR-CHINA BORDER REGION': '缅甸-中国边境地区',
    'BURMA-CHINA BORDER REGION': '缅甸-中国边境地区',
    'TAIWAN REGION': '台湾地区',
    'NEAR EAST COAST OF HONSHU, JAPAN': '日本本州东岸附近',
    'OFF EAST COAST OF HONSHU, JAPAN': '日本本州东岸近海',
    'RYUKYU ISLANDS, JAPAN': '日本琉球群岛',
    'BONIN ISLANDS, JAPAN': '日本小笠原群岛',
    'KURIL ISLANDS': '千岛群岛',
    'KAMCHATKA PENINSULA, RUSSIA': '俄罗斯堪察加半岛',
    'SOUTHERN XINJIANG, CHINA': '中国新疆南部',
    'NORTHERN XINJIANG, CHINA': '中国新疆北部',
    'WESTERN XIZANG, CHINA': '中国西藏西部',
    'EASTERN XIZANG, CHINA': '中国西藏东部',
    'SICHUAN, CHINA': '中国四川',
    'YUNNAN, CHINA': '中国云南',
    'QINGHAI, CHINA': '中国青海',
    'GANSU, CHINA': '中国甘肃',
    'FUJIAN, CHINA': '中国福建',
    'CHONGQING, CHINA': '中国重庆'
  };

  const PLACE_TERMS = [
    ['PAPUA NEW GUINEA', '巴布亚新几内亚'], ['SOLOMON ISLANDS', '所罗门群岛'],
    ['MARIANA ISLANDS', '马里亚纳群岛'], ['KERMADEC ISLANDS', '克马德克群岛'],
    ['NEW ZEALAND', '新西兰'], ['UNITED STATES', '美国'], ['SOUTH KOREA', '韩国'],
    ['NORTH KOREA', '朝鲜'], ['INDIAN OCEAN', '印度洋'], ['PACIFIC OCEAN', '太平洋'],
    ['ATLANTIC OCEAN', '大西洋'], ['SOUTH CHINA SEA', '南海'], ['EAST CHINA SEA', '东海'],
    ['YELLOW SEA', '黄海'], ['SEA OF JAPAN', '日本海'], ['BAY OF BENGAL', '孟加拉湾'],
    ['AFGHANISTAN', '阿富汗'], ['ARGENTINA', '阿根廷'], ['AUSTRALIA', '澳大利亚'],
    ['CALIFORNIA', '加利福尼亚'], ['CANADA', '加拿大'], ['CHILE', '智利'],
    ['CHINA', '中国'], ['COLOMBIA', '哥伦比亚'], ['ECUADOR', '厄瓜多尔'],
    ['GREECE', '希腊'], ['HAWAII', '夏威夷'], ['ICELAND', '冰岛'],
    ['INDIA', '印度'], ['INDONESIA', '印度尼西亚'], ['IRAN', '伊朗'],
    ['JAPAN', '日本'], ['MEXICO', '墨西哥'], ['MYANMAR', '缅甸'],
    ['NEPAL', '尼泊尔'], ['PAKISTAN', '巴基斯坦'], ['PERU', '秘鲁'],
    ['PHILIPPINES', '菲律宾'], ['RUSSIA', '俄罗斯'], ['TAIWAN', '台湾'],
    ['TONGA', '汤加'], ['TURKEY', '土耳其'], ['VANUATU', '瓦努阿图'],
    ['VIETNAM', '越南'], ['ALASKA', '阿拉斯加'], ['HOKKAIDO', '北海道'],
    ['HONSHU', '本州'], ['KYUSHU', '九州'], ['SHIKOKU', '四国'],
    ['OKINAWA', '冲绳'], ['RYUKYU', '琉球'], ['MINDANAO', '棉兰老岛'],
    ['LUZON', '吕宋岛'], ['SUMATRA', '苏门答腊岛'], ['JAVA', '爪哇岛'],
    ['SULAWESI', '苏拉威西岛'], ['BALI', '巴厘岛'], ['KAMCHATKA', '堪察加'],
    ['KURIL', '千岛'], ['XINJIANG', '新疆'], ['XIZANG', '西藏'],
    ['TIBET', '西藏'], ['SICHUAN', '四川'], ['YUNNAN', '云南'],
    ['QINGHAI', '青海'], ['GANSU', '甘肃'], ['FUJIAN', '福建'],
    ['CHONGQING', '重庆'], ['GUANGDONG', '广东'], ['GUANGXI', '广西'],
    ['BEIJING', '北京'], ['SHANGHAI', '上海'], ['TIANJIN', '天津'],
    ['CHENGDU', '成都'], ['GUANGZHOU', '广州'], ['SHENZHEN', '深圳'],
    ['TAIPEI', '台北'], ['HONG KONG', '香港'], ['MACAO', '澳门'],
    ['NEW BRITAIN', '新不列颠'], ['NEW IRELAND', '新爱尔兰'], ['NEW CALEDONIA', '新喀里多尼亚'],
    ['LOYALTY ISLANDS', '洛亚蒂群岛'], ['SOUTH SANDWICH', '南桑威奇'], ['ALEUTIAN', '阿留申'],
    ['CENTRAL AMERICA', '中美洲'], ['DOMINICAN REPUBLIC', '多米尼加共和国'], ['PUERTO RICO', '波多黎各'],
    ['GUATEMALA', '危地马拉'], ['COSTA RICA', '哥斯达黎加'], ['EL SALVADOR', '萨尔瓦多'],
    ['NICARAGUA', '尼加拉瓜'], ['PANAMA', '巴拿马'], ['BOLIVIA', '玻利维亚'],
    ['VENEZUELA', '委内瑞拉'], ['FIJI', '斐济'], ['SAMOA', '萨摩亚'], ['GUAM', '关岛'],
    ['KM', '公里'], ['NNE', '北东北'], ['NNW', '北西北'], ['ENE', '东东北'], ['ESE', '东东南'],
    ['SSE', '南东南'], ['SSW', '南西南'], ['WNW', '西西北'], ['WSW', '西南偏西'],
    ['NE', '东北'], ['NW', '西北'], ['SE', '东南'], ['SW', '西南'], ['OF', ''],
    ['SOUTHEASTERN', '东南部'], ['SOUTHWESTERN', '西南部'], ['NORTHEASTERN', '东北部'],
    ['NORTHWESTERN', '西北部'], ['SOUTHERN', '南部'], ['NORTHERN', '北部'],
    ['EASTERN', '东部'], ['WESTERN', '西部'], ['CENTRAL', '中部'],
    ['BORDER REGION', '边境地区'], ['OFF COAST OF', '近海'], ['COAST OF', '海岸'],
    ['NEAR', '附近'], ['REGION', '地区'], ['ISLANDS', '群岛'], ['ISLAND', '岛'],
    ['SEA', '海'], ['NORTH', '北部'], ['SOUTH', '南部'], ['EAST', '东部'], ['WEST', '西部']
  ];
  const GENERIC_PLACE_ALIASES = new Set(['ALL', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTHEAST', 'NORTHWEST', 'SOUTHERN', 'NORTHERN', 'EASTERN', 'WESTERN']);

  const AREA_OPTIONS = [
    area('CN_MAINLAND', '🇨🇳', '中华人民共和国', ['中国', '中国大陆', '大陆', '香港', '澳门', '台湾'], [73, 18, 135, 54], [
      ['anhui', '安徽'], ['beijing', '北京'], ['chongqing', '重庆'], ['fujian', '福建'],
      ['gansu', '甘肃'], ['guangdong', '广东'], ['guangxi', '广西'], ['guizhou', '贵州'],
      ['hainan', '海南'], ['hebei', '河北'], ['henan', '河南'], ['heilongjiang', '黑龙江'],
      ['hubei', '湖北'], ['hunan', '湖南'], ['jilin', '吉林'], ['jiangsu', '江苏'],
      ['jiangxi', '江西'], ['liaoning', '辽宁'], ['neimenggu', '内蒙古'], ['ningxia', '宁夏'],
      ['qinghai', '青海'], ['shandong', '山东'], ['shanxi', '山西'], ['shaanxi', '陕西'],
      ['shanghai', '上海'], ['sichuan', '四川'], ['tianjin', '天津'], ['xizang', '西藏'],
      ['xinjiang', '新疆'], ['yunnan', '云南'], ['zhejiang', '浙江'],
      ['hongkong', '香港', 'Hong Kong'], ['macao', '澳门', 'Macau', 'Macao'], ['taiwan', '台湾', 'Taiwan']
    ]),
    area('AR', '🇦🇷', '阿根廷', ['Argentina'], [-73.6, -55.2, -53.6, -21.8], [
      ['buenos-aires', '布宜诺斯艾利斯', 'Buenos Aires'], ['catamarca', '卡塔马卡', 'Catamarca'], ['chaco', '查科', 'Chaco'],
      ['chubut', '丘布特', 'Chubut'], ['cordoba', '科尔多瓦', 'Cordoba', 'Córdoba'], ['corrientes', '科连特斯', 'Corrientes'],
      ['jujuy', '胡胡伊', 'Jujuy'], ['la-rioja', '拉里奥哈', 'La Rioja'], ['mendoza', '门多萨', 'Mendoza'],
      ['neuquen', '内乌肯', 'Neuquen', 'Neuquén'], ['salta', '萨尔塔', 'Salta'], ['san-juan', '圣胡安', 'San Juan'],
      ['santa-cruz', '圣克鲁斯', 'Santa Cruz'], ['tierra-del-fuego', '火地岛', 'Tierra del Fuego'], ['tucuman', '图库曼', 'Tucuman', 'Tucumán']
    ]),
    area('IS', '🇮🇸', '冰岛', ['Iceland'], [-25.0, 63.0, -13.0, 67.5], [
      ['capital', '首都区', 'Capital Region', 'Reykjavik'], ['southern-peninsula', '南半岛', 'Southern Peninsula'],
      ['west', '西部区', 'West'], ['westfjords', '西峡湾', 'Westfjords'], ['northwest', '西北区', 'Northwest'],
      ['northeast', '东北区', 'Northeast'], ['east', '东部区', 'East'], ['south', '南部区', 'South']
    ]),
    area('RU', '🇷🇺', '俄罗斯', ['Russia'], [19.0, 41.0, 180.0, 82.0], [
      ['kamchatka', '堪察加', 'Kamchatka'], ['sakhalin', '萨哈林', 'Sakhalin'], ['kuril', '千岛群岛', 'Kuril'],
      ['primorye', '滨海边疆区', 'Primorye'], ['khabarovsk', '哈巴罗夫斯克', 'Khabarovsk'], ['irkutsk', '伊尔库茨克', 'Irkutsk'],
      ['buryatia', '布里亚特', 'Buryatia'], ['altai', '阿尔泰', 'Altai'], ['moscow', '莫斯科', 'Moscow'], ['caucasus', '北高加索', 'Caucasus']
    ]),
    area('PH', '🇵🇭', '菲律宾', ['Philippines'], [116.0, 4.0, 127.0, 22.0], [
      ['metro-manila', '马尼拉大都会', 'Metro Manila'], ['cordillera', '科迪勒拉', 'Cordillera'], ['ilocos', '伊罗戈', 'Ilocos'],
      ['cagayan-valley', '卡加延河谷', 'Cagayan'], ['central-luzon', '中吕宋', 'Central Luzon'], ['calabarzon', '卡拉巴松', 'Calabarzon'],
      ['mimaropa', '民马罗巴', 'Mimaropa'], ['bicol', '比科尔', 'Bicol'], ['western-visayas', '西米沙鄢', 'Western Visayas'],
      ['central-visayas', '中米沙鄢', 'Central Visayas'], ['eastern-visayas', '东米沙鄢', 'Eastern Visayas'], ['zamboanga', '三宝颜', 'Zamboanga'],
      ['northern-mindanao', '北棉兰老', 'Northern Mindanao'], ['davao', '达沃', 'Davao'], ['soccsksargen', '索克斯克萨尔根', 'Soccsksargen'], ['caraga', '卡拉加', 'Caraga']
    ]),
    area('CO', '🇨🇴', '哥伦比亚', ['Colombia'], [-79.0, -5.0, -66.0, 13.0], [
      ['antioquia', '安蒂奥基亚', 'Antioquia'], ['bogota', '波哥大', 'Bogota', 'Bogotá'], ['bolivar', '玻利瓦尔', 'Bolivar', 'Bolívar'],
      ['boyaca', '博亚卡', 'Boyaca', 'Boyacá'], ['caldas', '卡尔达斯', 'Caldas'], ['cauca', '考卡', 'Cauca'],
      ['cundinamarca', '昆迪纳马卡', 'Cundinamarca'], ['narino', '纳里尼奥', 'Narino', 'Nariño'], ['santander', '桑坦德', 'Santander'],
      ['tolima', '托利马', 'Tolima'], ['valle', '考卡山谷', 'Valle del Cauca']
    ]),
    area('EC', '🇪🇨', '厄瓜多尔', ['Ecuador'], [-92.0, -5.2, -75.0, 2.2], [
      ['azuay', '阿苏艾', 'Azuay'], ['bolivar', '玻利瓦尔', 'Bolivar'], ['canar', '卡尼亚尔', 'Canar', 'Cañar'],
      ['chimborazo', '钦博拉索', 'Chimborazo'], ['cotopaxi', '科托帕希', 'Cotopaxi'], ['el-oro', '埃尔奥罗', 'El Oro'],
      ['esmeraldas', '埃斯梅拉达斯', 'Esmeraldas'], ['galapagos', '加拉帕戈斯', 'Galapagos'], ['guayas', '瓜亚斯', 'Guayas'],
      ['imbabura', '因巴布拉', 'Imbabura'], ['loja', '洛哈', 'Loja'], ['manabi', '马纳比', 'Manabi'], ['pichincha', '皮钦查', 'Pichincha'], ['tungurahua', '通古拉瓦', 'Tungurahua']
    ]),
    area('KR', '🇰🇷', '韩国', ['South Korea', 'Korea'], [124.0, 33.0, 132.0, 39.5], [
      ['seoul', '首尔', 'Seoul'], ['busan', '釜山', 'Busan'], ['daegu', '大邱', 'Daegu'], ['incheon', '仁川', 'Incheon'],
      ['gwangju', '光州', 'Gwangju'], ['daejeon', '大田', 'Daejeon'], ['ulsan', '蔚山', 'Ulsan'], ['sejong', '世宗', 'Sejong'],
      ['gyeonggi', '京畿道', 'Gyeonggi'], ['gangwon', '江原道', 'Gangwon'], ['chungbuk', '忠清北道', 'North Chungcheong'],
      ['chungnam', '忠清南道', 'South Chungcheong'], ['jeonbuk', '全罗北道', 'North Jeolla'], ['jeonnam', '全罗南道', 'South Jeolla'],
      ['gyeongbuk', '庆尚北道', 'North Gyeongsang'], ['gyeongnam', '庆尚南道', 'South Gyeongsang'], ['jeju', '济州', 'Jeju']
    ]),
    area('CA', '🇨🇦', '加拿大', ['Canada'], [-141.0, 41.0, -52.0, 84.0], [
      ['alberta', '艾伯塔', 'Alberta'], ['british-columbia', '不列颠哥伦比亚', 'British Columbia'], ['manitoba', '曼尼托巴', 'Manitoba'],
      ['new-brunswick', '新不伦瑞克', 'New Brunswick'], ['newfoundland', '纽芬兰与拉布拉多', 'Newfoundland'], ['nova-scotia', '新斯科舍', 'Nova Scotia'],
      ['ontario', '安大略', 'Ontario'], ['prince-edward-island', '爱德华王子岛', 'Prince Edward Island'], ['quebec', '魁北克', 'Quebec', 'Québec'],
      ['saskatchewan', '萨斯喀彻温', 'Saskatchewan'], ['northwest-territories', '西北地区', 'Northwest Territories'], ['nunavut', '努纳武特', 'Nunavut'], ['yukon', '育空', 'Yukon']
    ]),
    area('US', '🇺🇸', '美国', ['United States', 'USA', 'Alaska', 'Hawaii', 'California'], [-170.0, 18.0, -50.0, 72.0], [
      ['alaska', '阿拉斯加', 'Alaska'], ['california', '加利福尼亚', 'California'], ['hawaii', '夏威夷', 'Hawaii'], ['oregon', '俄勒冈', 'Oregon'],
      ['washington', '华盛顿州', 'Washington'], ['nevada', '内华达', 'Nevada'], ['utah', '犹他', 'Utah'], ['idaho', '爱达荷', 'Idaho'],
      ['montana', '蒙大拿', 'Montana'], ['wyoming', '怀俄明', 'Wyoming'], ['colorado', '科罗拉多', 'Colorado'], ['arizona', '亚利桑那', 'Arizona'],
      ['new-mexico', '新墨西哥', 'New Mexico'], ['texas', '得克萨斯', 'Texas'], ['oklahoma', '俄克拉荷马', 'Oklahoma'], ['new-york', '纽约', 'New York'],
      ['puerto-rico', '波多黎各', 'Puerto Rico']
    ]),
    area('PE', '🇵🇪', '秘鲁', ['Peru'], [-82.0, -19.0, -68.0, 1.0], [
      ['amazonas', '亚马孙', 'Amazonas'], ['ancash', '安卡什', 'Ancash'], ['arequipa', '阿雷基帕', 'Arequipa'], ['ayacucho', '阿亚库乔', 'Ayacucho'],
      ['cajamarca', '卡哈马卡', 'Cajamarca'], ['cusco', '库斯科', 'Cusco'], ['huancavelica', '万卡韦利卡', 'Huancavelica'], ['ica', '伊卡', 'Ica'],
      ['junin', '胡宁', 'Junin', 'Junín'], ['la-libertad', '拉利伯塔德', 'La Libertad'], ['lima', '利马', 'Lima'], ['piura', '皮乌拉', 'Piura'], ['puno', '普诺', 'Puno'], ['tacna', '塔克纳', 'Tacna']
    ]),
    area('MX', '🇲🇽', '墨西哥', ['Mexico'], [-118.0, 14.0, -86.0, 33.0], [
      ['baja-california', '下加利福尼亚', 'Baja California'], ['chiapas', '恰帕斯', 'Chiapas'], ['chihuahua', '奇瓦瓦', 'Chihuahua'],
      ['coahuila', '科阿韦拉', 'Coahuila'], ['colima', '科利马', 'Colima'], ['guerrero', '格雷罗', 'Guerrero'], ['jalisco', '哈利斯科', 'Jalisco'],
      ['mexico-city', '墨西哥城', 'Mexico City'], ['michoacan', '米却肯', 'Michoacan', 'Michoacán'], ['oaxaca', '瓦哈卡', 'Oaxaca'],
      ['puebla', '普埃布拉', 'Puebla'], ['sonora', '索诺拉', 'Sonora'], ['veracruz', '韦拉克鲁斯', 'Veracruz']
    ]),
    area('JP', '🇯🇵', '日本', ['Japan', 'Honshu', 'Hokkaido', 'Kyushu'], [122.0, 24.0, 153.0, 46.5], [
      ['hokkaido', '北海道', 'Hokkaido'], ['aomori', '青森', 'Aomori'], ['iwate', '岩手', 'Iwate'], ['miyagi', '宫城', 'Miyagi'],
      ['akita', '秋田', 'Akita'], ['yamagata', '山形', 'Yamagata'], ['fukushima', '福岛', 'Fukushima'], ['ibaraki', '茨城', 'Ibaraki'],
      ['tochigi', '栃木', 'Tochigi'], ['gunma', '群马', 'Gunma'], ['chiba', '千叶', 'Chiba'], ['tokyo', '东京', 'Tokyo'],
      ['kanagawa', '神奈川', 'Kanagawa'], ['niigata', '新潟', 'Niigata'], ['ishikawa', '石川', 'Ishikawa'], ['nagano', '长野', 'Nagano'],
      ['shizuoka', '静冈', 'Shizuoka'], ['aichi', '爱知', 'Aichi'], ['osaka', '大阪', 'Osaka'], ['hyogo', '兵库', 'Hyogo'],
      ['hiroshima', '广岛', 'Hiroshima'], ['kochi', '高知', 'Kochi'], ['fukuoka', '福冈', 'Fukuoka'], ['kumamoto', '熊本', 'Kumamoto'],
      ['kagoshima', '鹿儿岛', 'Kagoshima'], ['okinawa', '冲绳', 'Okinawa']
    ]),
    area('TR', '🇹🇷', '土耳其', ['Turkey', 'Türkiye'], [25.0, 35.0, 45.0, 43.0], [
      ['adana', '阿达纳', 'Adana'], ['ankara', '安卡拉', 'Ankara'], ['antalya', '安塔利亚', 'Antalya'], ['balikesir', '巴勒克埃西尔', 'Balikesir'],
      ['bursa', '布尔萨', 'Bursa'], ['canakkale', '恰纳卡莱', 'Canakkale'], ['denizli', '代尼兹利', 'Denizli'], ['elazig', '埃拉泽', 'Elazig'],
      ['erzincan', '埃尔津詹', 'Erzincan'], ['erzurum', '埃尔祖鲁姆', 'Erzurum'], ['hatay', '哈塔伊', 'Hatay'], ['istanbul', '伊斯坦布尔', 'Istanbul'],
      ['izmir', '伊兹密尔', 'Izmir'], ['kahramanmaras', '卡赫拉曼马拉什', 'Kahramanmaras'], ['kocaeli', '科贾埃利', 'Kocaeli'], ['malatya', '马拉蒂亚', 'Malatya'], ['van', '凡城', 'Van']
    ]),
    area('GR', '🇬🇷', '希腊', ['Greece'], [19.0, 34.0, 30.0, 42.0], [
      ['attica', '阿提卡', 'Attica'], ['central-greece', '中希腊', 'Central Greece'], ['central-macedonia', '中马其顿', 'Central Macedonia'],
      ['crete', '克里特', 'Crete'], ['east-macedonia-thrace', '东马其顿和色雷斯', 'East Macedonia'], ['epirus', '伊庇鲁斯', 'Epirus'],
      ['ionian-islands', '爱奥尼亚群岛', 'Ionian Islands'], ['north-aegean', '北爱琴', 'North Aegean'], ['peloponnese', '伯罗奔尼撒', 'Peloponnese'],
      ['south-aegean', '南爱琴', 'South Aegean'], ['thessaly', '色萨利', 'Thessaly'], ['west-greece', '西希腊', 'West Greece'], ['west-macedonia', '西马其顿', 'West Macedonia']
    ]),
    area('NZ', '🇳🇿', '新西兰', ['New Zealand'], [165.0, -48.0, 179.0, -33.0], [
      ['northland', '北地', 'Northland'], ['auckland', '奥克兰', 'Auckland'], ['waikato', '怀卡托', 'Waikato'], ['bay-of-plenty', '丰盛湾', 'Bay of Plenty'],
      ['gisborne', '吉斯伯恩', 'Gisborne'], ['hawkes-bay', '霍克斯湾', 'Hawke'], ['taranaki', '塔拉纳基', 'Taranaki'], ['wellington', '惠灵顿', 'Wellington'],
      ['tasman', '塔斯曼', 'Tasman'], ['marlborough', '马尔堡', 'Marlborough'], ['canterbury', '坎特伯雷', 'Canterbury'], ['otago', '奥塔哥', 'Otago'], ['southland', '南地', 'Southland']
    ]),
    area('PG', '🇵🇬', '巴布亚新几内亚', ['Papua New Guinea'], [140.0, -12.5, 156.5, 1.0], [
      ['bougainville', '布干维尔', 'Bougainville'], ['central', '中央省', 'Central'], ['east-new-britain', '东新不列颠', 'East New Britain'],
      ['east-sepik', '东塞皮克', 'East Sepik'], ['eastern-highlands', '东高地', 'Eastern Highlands'], ['enga', '恩加', 'Enga'],
      ['gulf', '海湾省', 'Gulf'], ['hela', '赫拉', 'Hela'], ['madang', '马当', 'Madang'], ['milne-bay', '米尔恩湾', 'Milne Bay'],
      ['morobe', '莫罗贝', 'Morobe'], ['new-ireland', '新爱尔兰', 'New Ireland'], ['western', '西部省', 'Western'], ['west-new-britain', '西新不列颠', 'West New Britain']
    ]),
    area('IN', '🇮🇳', '印度', ['India'], [68.0, 6.0, 98.0, 36.0], [
      ['andaman', '安达曼和尼科巴', 'Andaman'], ['andhra-pradesh', '安得拉邦', 'Andhra Pradesh'], ['assam', '阿萨姆', 'Assam'], ['bihar', '比哈尔', 'Bihar'],
      ['delhi', '德里', 'Delhi'], ['gujarat', '古吉拉特', 'Gujarat'], ['himachal-pradesh', '喜马偕尔', 'Himachal'], ['jammu-kashmir', '查谟和克什米尔', 'Kashmir'],
      ['karnataka', '卡纳塔克', 'Karnataka'], ['kerala', '喀拉拉', 'Kerala'], ['maharashtra', '马哈拉施特拉', 'Maharashtra'], ['manipur', '曼尼普尔', 'Manipur'],
      ['meghalaya', '梅加拉亚', 'Meghalaya'], ['mizoram', '米佐拉姆', 'Mizoram'], ['nagaland', '那加兰', 'Nagaland'], ['odisha', '奥迪沙', 'Odisha'],
      ['rajasthan', '拉贾斯坦', 'Rajasthan'], ['sikkim', '锡金', 'Sikkim'], ['tamil-nadu', '泰米尔纳德', 'Tamil Nadu'], ['uttarakhand', '北阿坎德', 'Uttarakhand'], ['west-bengal', '西孟加拉', 'West Bengal']
    ]),
    area('ID', '🇮🇩', '印度尼西亚', ['Indonesia'], [94.0, -12.0, 142.0, 8.0], [
      ['aceh', '亚齐', 'Aceh'], ['north-sumatra', '北苏门答腊', 'North Sumatra'], ['west-sumatra', '西苏门答腊', 'West Sumatra'], ['riau', '廖内', 'Riau'],
      ['bengkulu', '明古鲁', 'Bengkulu'], ['lampung', '楠榜', 'Lampung'], ['jakarta', '雅加达', 'Jakarta'], ['west-java', '西爪哇', 'West Java'],
      ['central-java', '中爪哇', 'Central Java'], ['east-java', '东爪哇', 'East Java'], ['bali', '巴厘', 'Bali'], ['west-nusa-tenggara', '西努沙登加拉', 'West Nusa Tenggara'],
      ['east-nusa-tenggara', '东努沙登加拉', 'East Nusa Tenggara'], ['west-kalimantan', '西加里曼丹', 'West Kalimantan'], ['south-sulawesi', '南苏拉威西', 'South Sulawesi'],
      ['north-sulawesi', '北苏拉威西', 'North Sulawesi'], ['maluku', '马鲁古', 'Maluku'], ['papua', '巴布亚', 'Papua']
    ]),
    area('CL', '🇨🇱', '智利', ['Chile'], [-76.0, -56.0, -66.0, -17.0], [
      ['arica', '阿里卡和帕里纳科塔', 'Arica'], ['tarapaca', '塔拉帕卡', 'Tarapaca'], ['antofagasta', '安托法加斯塔', 'Antofagasta'],
      ['atacama', '阿塔卡马', 'Atacama'], ['coquimbo', '科金博', 'Coquimbo'], ['valparaiso', '瓦尔帕莱索', 'Valparaiso'],
      ['santiago', '圣地亚哥都会区', 'Santiago'], ['ohiggins', '奥希金斯', "O'Higgins"], ['maule', '马乌莱', 'Maule'],
      ['nuble', '纽布莱', 'Nuble', 'Ñuble'], ['biobio', '比奥比奥', 'Biobio', 'Biobío'], ['araucania', '阿劳卡尼亚', 'Araucania'],
      ['los-rios', '洛斯里奥斯', 'Los Rios'], ['los-lagos', '洛斯拉戈斯', 'Los Lagos'], ['aysen', '艾森', 'Aysen'], ['magallanes', '麦哲伦', 'Magallanes']
    ]),
    area('IR', '🇮🇷', '伊朗', ['Iran'], [44.0, 24.0, 64.0, 40.5], [
      ['alborz', '厄尔布尔士', 'Alborz'], ['ardabil', '阿尔达比勒', 'Ardabil'], ['bushehr', '布什尔', 'Bushehr'], ['east-azerbaijan', '东阿塞拜疆', 'East Azerbaijan'],
      ['fars', '法尔斯', 'Fars'], ['gilan', '吉兰', 'Gilan'], ['hormozgan', '霍尔木兹甘', 'Hormozgan'], ['isfahan', '伊斯法罕', 'Isfahan'],
      ['kerman', '克尔曼', 'Kerman'], ['kermanshah', '克尔曼沙阿', 'Kermanshah'], ['khuzestan', '胡齐斯坦', 'Khuzestan'],
      ['razavi-khorasan', '礼萨呼罗珊', 'Razavi Khorasan'], ['sistan-baluchestan', '锡斯坦和俾路支斯坦', 'Sistan'], ['tehran', '德黑兰', 'Tehran'], ['west-azerbaijan', '西阿塞拜疆', 'West Azerbaijan']
    ]),
    area('PK', '🇵🇰', '巴基斯坦', ['Pakistan'], [60.0, 23.0, 78.0, 38.0], [
      ['balochistan', '俾路支斯坦', 'Balochistan'], ['gilgit-baltistan', '吉尔吉特-巴尔蒂斯坦', 'Gilgit'], ['islamabad', '伊斯兰堡', 'Islamabad'],
      ['khyber-pakhtunkhwa', '开伯尔-普什图省', 'Khyber'], ['punjab', '旁遮普', 'Punjab'], ['sindh', '信德', 'Sindh'], ['azad-kashmir', '自由克什米尔', 'Azad Kashmir']
    ]),
    area('NP', '🇳🇵', '尼泊尔', ['Nepal'], [80.0, 26.0, 89.0, 31.0], [
      ['bagmati', '巴格马蒂', 'Bagmati'], ['gandaki', '甘达基', 'Gandaki'], ['karnali', '格尔纳利', 'Karnali'],
      ['koshi', '戈希', 'Koshi'], ['lumbini', '蓝毗尼', 'Lumbini'], ['madhesh', '马德什', 'Madhesh'], ['sudurpaschim', '远西省', 'Sudurpashchim']
    ]),
    area('MM', '🇲🇲', '缅甸', ['Myanmar', 'Burma'], [92.0, 9.0, 102.0, 29.5], [
      ['ayeyarwady', '伊洛瓦底', 'Ayeyarwady'], ['bago', '勃固', 'Bago'], ['chin', '钦邦', 'Chin'], ['kachin', '克钦邦', 'Kachin'],
      ['kayah', '克耶邦', 'Kayah'], ['kayin', '克伦邦', 'Kayin'], ['magway', '马圭', 'Magway'], ['mandalay', '曼德勒', 'Mandalay'],
      ['naypyidaw', '内比都', 'Naypyidaw'], ['rakhine', '若开邦', 'Rakhine'], ['sagaing', '实皆', 'Sagaing'], ['shan', '掸邦', 'Shan'], ['yangon', '仰光', 'Yangon']
    ]),
    area('FJ', '🇫🇯', '斐济', ['Fiji'], [176.0, -21.5, -178.0, -12.0], [
      ['central', '中央大区', 'Central'], ['eastern', '东部大区', 'Eastern'], ['northern', '北部大区', 'Northern'], ['western', '西部大区', 'Western'], ['rotuma', '罗图马', 'Rotuma']
    ]),
    area('TO', '🇹🇴', '汤加', ['Tonga'], [-176.5, -23.0, -173.5, -15.0], [
      ['tongatapu', '汤加塔布', 'Tongatapu'], ['vavau', '瓦瓦乌', 'Vavau'], ['haapai', '哈派', 'Haapai'], ['eua', '埃瓦', 'Eua'], ['niuasa', '纽阿斯', 'Niuas']
    ]),
    area('VU', '🇻🇺', '瓦努阿图', ['Vanuatu'], [166.0, -21.0, 171.0, -13.0], [
      ['malampa', '马朗巴', 'Malampa'], ['penama', '彭纳马', 'Penama'], ['sanma', '桑马', 'Sanma'], ['shefa', '谢法', 'Shefa'], ['tafea', '塔菲阿', 'Tafea'], ['torba', '托尔巴', 'Torba']
    ]),
    { key: 'GLOBAL', flag: '🌐', label: '全球', aliases: [], regions: [region('all', '全部')] }
  ];

  const ROMAN_INTENSITY = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12
  };
  const TIME_ZONE_LABELS = {
    'Asia/Shanghai': { short: 'BJT', full: '北京时间' },
    'Asia/Chongqing': { short: 'BJT', full: '北京时间' },
    'Asia/Harbin': { short: 'BJT', full: '北京时间' },
    'Asia/Urumqi': { short: 'BJT', full: '北京时间' },
    'Asia/Hong_Kong': { short: 'HKT', full: '香港时间' },
    'Asia/Macau': { short: 'MOT', full: '澳门时间' },
    'Asia/Taipei': { short: 'TWT', full: '台北时间' },
    'Europe/Moscow': { short: 'MSK', full: '莫斯科时间' },
    UTC: { short: 'UTC', full: '协调世界时' },
    'Etc/UTC': { short: 'UTC', full: '协调世界时' }
  };

  function area(key, flag, label, aliases, bbox, regions) {
    return {
      key,
      flag,
      label,
      aliases: [label].concat(aliases || []),
      bbox,
      regions: [region('all', '全部')].concat((regions || []).map(item => region(item[0], item[1], ...item.slice(2))))
    };
  }

  function region(key, label, ...aliases) {
    return { key, label, aliases: [label].concat(aliases || []) };
  }

  function clean(value, maxLength = 512) {
    if (value === undefined || value === null) return '';
    const limit = Math.max(1, Math.min(4096, Number(maxLength) || 512));
    return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
  }

  function standardizePlaceName(value) {
    const original = clean(value, 240).replace(/臺/g, '台');
    if (!original) return '';
    const exact = original.toUpperCase().replace(/\s+/g, ' ').trim();
    if (PLACE_EXACT[exact]) return PLACE_EXACT[exact];
    const normalized = exact.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (PLACE_EXACT[normalized]) return PLACE_EXACT[normalized];
    if (/[\u4e00-\u9fa5]/.test(original) && !/[A-Za-z]/.test(original)) return original;

    const comma = normalized.match(/^(.+),\s*([A-Z ]+)$/);
    if (comma) {
      const place = translatePlaceFragment(comma[1]);
      const country = translatePlaceFragment(comma[2]);
      if (country && place && place !== country && !place.includes(country)) return `${country}${place}`;
      return place || country || '未知地区';
    }
    return translatePlaceFragment(normalized, '未知地区') || original;
  }

  function translatePlaceFragment(value, fallback = '') {
    let output = clean(value).toUpperCase().replace(/[_-]+/g, ' ');
    for (const [from, to] of PLACE_TERMS) {
      output = output.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
    }
    for (const area of AREA_OPTIONS) {
      for (const alias of area.aliases || []) {
        if (!/[\u4e00-\u9fa5]/.test(alias)) {
          output = output.replace(new RegExp(`\\b${escapeRegExp(String(alias).toUpperCase())}\\b`, 'g'), area.label);
        }
      }
      for (const regionOption of area.regions || []) {
        for (const alias of regionOption.aliases || []) {
          const normalizedAlias = String(alias).toUpperCase();
          if (!/[\u4e00-\u9fa5]/.test(alias) && !GENERIC_PLACE_ALIASES.has(normalizedAlias)) {
            output = output.replace(new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`, 'g'), regionOption.label);
          }
        }
      }
    }
    const withoutPunctuation = output
      .replace(/[(),]/g, ' ')
      .replace(/地区地区/g, '地区')
      .trim();
    if (/[A-Z]/.test(withoutPunctuation)) {
      return collapseDuplicatePlaceWords(withoutPunctuation.replace(/[A-Z][A-Z.' ]*/g, '').replace(/\s+/g, '')) || fallback;
    }
    return collapseDuplicatePlaceWords(withoutPunctuation.replace(/\s+/g, ''));
  }

  function collapseDuplicatePlaceWords(value) {
    let output = clean(value);
    const labels = new Set(PLACE_TERMS.map(item => item[1]).filter(label => label.length > 1));
    for (const area of AREA_OPTIONS) {
      labels.add(area.label);
      for (const option of area.regions || []) if (option.label.length > 1) labels.add(option.label);
    }
    for (const label of labels) {
      output = output.replace(new RegExp(`${escapeRegExp(label)}(?:${escapeRegExp(label)})+`, 'g'), label);
    }
    return output;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function pick(source, keys) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return '';
  }

  function parseNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const match = String(value).replace(/,/g, '').match(/[-+]?\d+(\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function firstEvent(rawData) {
    if (Array.isArray(rawData)) return rawData[0] || {};
    if (!rawData || typeof rawData !== 'object') return {};
    const arrayKeys = ['data', 'Data', 'list', 'List', 'records', 'events', 'result', 'Result'];
    for (const key of arrayKeys) {
      if (Array.isArray(rawData[key])) return rawData[key][0] || {};
    }
    const objectKeys = ['data', 'Data', 'event', 'Event', 'earthquake'];
    for (const key of objectKeys) {
      if (rawData[key] && typeof rawData[key] === 'object' && !Array.isArray(rawData[key])) {
        return rawData[key];
      }
    }
    return rawData;
  }

  function flattenEvent(rawData) {
    const event = firstEvent(rawData);
    if (event && event.EarthquakeInfo) {
      const info = event.EarthquakeInfo || {};
      const epicenter = info.Epicenter || {};
      const magnitude = info.EarthquakeMagnitude || {};
      return {
        ...event,
        id: event.EarthquakeNo || event.ReportNo || event.ReportGUID,
        place: epicenter.Location || event.ReportContent,
        magnitude: magnitude.MagnitudeValue,
        depth: info.FocalDepth,
        latitude: epicenter.EpicenterLatitude,
        longitude: epicenter.EpicenterLongitude,
        time: info.OriginTime,
        MaxIntensity: cwaMaxIntensity(event.Intensity)
      };
    }
    const feature = event && event.type === 'Feature' ? event : null;
    if (!feature) return event;
    const props = feature.properties || {};
    const coords = feature.geometry && Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [];
    return {
      ...props,
      id: feature.id || props.id || props.source_id || props.unid,
      place: props.place || props.flynn_region || props.region || props.description,
      magnitude: props.mag || props.magnitude,
      longitude: coords[0],
      latitude: coords[1],
      depth: coords[2],
      time: props.time || props.time_utc || props.datetime,
      MaxIntensity: props.mmi || props.intensity
    };
  }

  function cwaMaxIntensity(intensity) {
    const areas = intensity && Array.isArray(intensity.ShakingArea) ? intensity.ShakingArea : [];
    let max = null;
    for (const area of areas) {
      const value = parseNumber(area && (area.AreaIntensity || area.MaxIntensity));
      if (value !== null) max = max === null ? value : Math.max(max, value);
    }
    return max;
  }

  function normalizeTime(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number') {
      const millis = value > 1000000000000 ? value : value * 1000;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }
    const text = String(value).trim();
    const parsed = Date.parse(text.replace(/\//g, '-'));
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
  }

  function parseCountdown(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
    const text = String(value).trim();
    const maybeDate = /[-/:年月日T]/.test(text);
    const parsed = maybeDate ? Date.parse(text.replace(/\//g, '-')) : NaN;
    if (!Number.isNaN(parsed)) return Math.round((parsed - Date.now()) / 1000);
    const direct = parseNumber(text);
    if (direct !== null) return Math.round(direct);
    return null;
  }

  function normalizeEarthquakeData(source, rawData) {
    const sourceKey = typeof source === 'string' ? clean(source, 64) : clean(source && source.key, 64);
    const sourceLabel = typeof source === 'string' ? clean(source, 96) : clean(source && source.label, 96);
    const event = flattenEvent(rawData);
    const location = standardizePlaceName(pick(event, ['HypoCenter', 'hypocenter', 'location', 'placeName', 'LOCATION_C', 'LOCATION', 'Title', 'place', 'eventName'])) || '未知震中';
    const normalized = {
      type: 'earthquake',
      source: sourceKey || 'unknown',
      sourceLabel: sourceLabel || sourceKey || '未知来源',
      eventId: clean(pick(event, ['EventID', 'eventId', 'eq_id', 'id', 'report_id', 'CATA_ID', 'NEW_DID']), 160),
      location,
      magnitude: parseNumber(pick(event, ['Magnitude', 'Magunitude', 'magnitude', 'mag', 'M', 'MMS'])),
      depth: parseNumber(pick(event, ['Depth', 'depth', 'EPI_DEPTH'])),
      longitude: parseNumber(pick(event, ['Longitude', 'longitude', 'lon', 'lng', 'EPI_LON'])),
      latitude: parseNumber(pick(event, ['Latitude', 'latitude', 'lat', 'EPI_LAT'])),
      originTime: normalizeTime(pick(event, ['OriginTime', 'originTime', 'time', 'happen_time', 'startAt', 'O_TIME', 'SAVE_TIME'])),
      intensity: clean(pick(event, ['MaxIntensity', 'maxintensity', 'intensity', 'maxIntensity', 'maxforecastintensity']), 32),
      countdown: parseCountdown(pick(event, ['countdown', 'Countdown', 'WarnTime', 'arriveTime', 'ArrivalTime'])),
      rawData,
      receivedAt: new Date().toISOString()
    };
    normalized.eventKey = getEventKey(normalized);
    return normalized;
  }

  function getEventKey(event) {
    const id = clean(event && event.eventId, 160);
    if (id) return `event:${id}`;
    const source = clean(event && event.source, 64) || 'unknown';
    const location = clean(event && event.location, 240) || 'unknown';
    const magnitude = event && event.magnitude !== null && event.magnitude !== undefined ? String(event.magnitude) : 'unknown';
    const originTime = clean(event && event.originTime, 80) || 'unknown';
    return `fallback:${source}:${location}:${magnitude}:${originTime}`.toLowerCase();
  }

  function isRealEarthquake(event) {
    return Boolean(
      event &&
      clean(event.location) &&
      event.location !== '未知震中' &&
      Number.isFinite(Number(event.magnitude))
    );
  }

  function matchesArea(event, countryKey, regionKey) {
    const country = AREA_OPTIONS.find(item => item.key === countryKey) || AREA_OPTIONS[0];
    if (!event || country.key === 'GLOBAL') return true;
    const regionOption = (country.regions || []).find(item => item.key === regionKey);
    if (regionOption && regionOption.key !== 'all') {
      return matchesAliases(event, regionOption.aliases || [regionOption.label]);
    }
    return inBbox(event, country.bbox) || matchesAliases(event, country.aliases || [country.label]);
  }

  function matchesAliases(event, aliases) {
    const text = `${clean(event.location)} ${clean(event.rawData && event.rawData.place)} ${clean(event.rawData && event.rawData.LOCATION_C)}`.toLowerCase();
    return aliases.some(alias => text.includes(String(alias).toLowerCase()));
  }

  function inBbox(event, bbox) {
    if (!bbox || !Number.isFinite(Number(event.longitude)) || !Number.isFinite(Number(event.latitude))) return false;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const lon = Number(event.longitude);
    const lat = Number(event.latitude);
    const lonMatched = minLon <= maxLon ? lon >= minLon && lon <= maxLon : lon >= minLon || lon <= maxLon;
    return lonMatched && lat >= minLat && lat <= maxLat;
  }

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const aLat = Number(lat1);
    const aLon = Number(lon1);
    const bLat = Number(lat2);
    const bLon = Number(lon2);
    if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
    const radius = 6371;
    const toRad = value => (value * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function estimateCountdown(event, userLocation) {
    const waves = estimateWaveCountdowns(event, userLocation);
    return waves.s;
  }

  function estimateEpicenterIntensity(event) {
    const upstream = parseIntensity(event && event.intensity);
    const magnitude = Number(event && event.magnitude);
    const depth = Number(event && event.depth);
    if (!Number.isFinite(magnitude)) return upstream || event && event.intensity;
    const depthKm = Number.isFinite(depth) ? Math.max(1, depth) : 10;
    const level = Math.round(magnitude * 1.35 + 0.6 - Math.log10(depthKm + 10) * 1.2);
    const estimated = Math.max(1, Math.min(12, level));
    return upstream ? Math.min(upstream, estimated) : estimated;
  }

  function estimateLocalIntensity(event, userLocation) {
    const epicenter = parseIntensity(estimateEpicenterIntensity(event));
    const distance = calculateDistanceKm(
      userLocation && userLocation.lat,
      userLocation && userLocation.lon,
      event && event.latitude,
      event && event.longitude
    );
    if (!epicenter || distance === null) return '';
    const depth = Number(event && event.depth);
    const depthKm = Math.max(1, Number.isFinite(depth) ? depth : 10);
    const hypocentralDistance = Math.sqrt(distance * distance + depthKm * depthKm);
    const attenuation =
      Math.log10(Math.max(1, hypocentralDistance / depthKm)) * 2.1 +
      Math.max(0, distance - 20) / 180;
    const level = Math.round(epicenter - attenuation);
    return Math.max(1, Math.min(epicenter, Math.min(12, level)));
  }

  function estimateWaveCountdowns(event, userLocation) {
    const upstreamS = event && event.countdown !== null && event.countdown !== undefined && Number.isFinite(Number(event.countdown))
      ? Math.round(Number(event.countdown))
      : null;
    const distance = calculateDistanceKm(
      userLocation && userLocation.lat,
      userLocation && userLocation.lon,
      event && event.latitude,
      event && event.longitude
    );
    if (distance === null) return { p: null, s: upstreamS, distanceKm: null };
    const pTravelSeconds = distance / 6;
    const sTravelSeconds = distance / 3.5;
    const origin = Date.parse(event && event.originTime);
    if (Number.isNaN(origin)) {
      return {
        p: Math.round(pTravelSeconds),
        s: upstreamS !== null ? upstreamS : Math.round(sTravelSeconds),
        distanceKm: distance
      };
    }
    const elapsed = (Date.now() - origin) / 1000;
    return {
      p: Math.round(pTravelSeconds - elapsed),
      s: upstreamS !== null ? upstreamS : Math.round(sTravelSeconds - elapsed),
      distanceKm: distance
    };
  }

  function parseIntensity(value) {
    const text = clean(value).toUpperCase();
    if (!text) return null;
    if (ROMAN_INTENSITY[text]) return ROMAN_INTENSITY[text];
    const roman = text.match(/^(XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)\b/);
    if (roman) return ROMAN_INTENSITY[roman[1]];
    const number = parseNumber(text);
    if (number === null) return null;
    return Math.max(1, Math.min(12, Math.round(number)));
  }

  function intensityColor(intensity) {
    const level = parseIntensity(intensity);
    if (!level) {
      return { level: '', label: '未知', background: '#263142', color: '#d8e3f0', border: '#526176' };
    }
    if (level <= 2) return { level, label: `${level} 低强度`, background: '#d8f7ff', color: '#062833', border: '#6ac7df' };
    if (level <= 4) return { level, label: `${level} 中低强度`, background: '#58d5f6', color: '#042d3b', border: '#9be8fb' };
    if (level <= 6) return { level, label: `${level} 中强度`, background: '#f2d750', color: '#2a2300', border: '#fff096' };
    if (level <= 8) return { level, label: `${level} 强烈`, background: '#f08a24', color: '#190b00', border: '#ffc06f' };
    if (level <= 10) return { level, label: `${level} 严重`, background: '#e63f5f', color: '#fff8fb', border: '#ff93a8' };
    return { level, label: `${level} 极强`, background: '#8d49e8', color: '#ffffff', border: '#c7a7ff' };
  }

  function formatIntensitySummary(event, userLocation) {
    const local = intensityColor(estimateLocalIntensity(event, userLocation));
    const epicenter = intensityColor(estimateEpicenterIntensity(event));
    return {
      local,
      epicenter,
      localValue: local.level ? local.label : '--',
      epicenterValue: epicenter.level ? epicenter.label : '--',
      localShort: local.level ? `本地烈度 ${local.label}` : '本地烈度 --',
      epicenterShort: epicenter.level ? `震中烈度 ${epicenter.label}` : '震中烈度 --'
    };
  }

  function magnitudeIntensity(magnitude) {
    const value = Number(magnitude);
    if (!Number.isFinite(value)) return { level: '', label: '震级未知' };
    if (value < 3) return { level: 'micro', label: '微震' };
    if (value < 4) return { level: 'minor', label: '弱震' };
    if (value < 5) return { level: 'light', label: '有感地震' };
    if (value < 6) return { level: 'moderate', label: '中等地震' };
    if (value < 7) return { level: 'strong', label: '强震' };
    if (value < 8) return { level: 'major', label: '大地震' };
    return { level: 'great', label: '巨大地震' };
  }

  function formatNumber(value, suffix, digits) {
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) return '--';
    return `${Number(value).toFixed(digits === undefined ? 1 : digits)}${suffix || ''}`;
  }

  function formatCoordinatePair(latitude, longitude, digits = 3) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '--';
    const fixed = Number.isFinite(Number(digits)) ? Number(digits) : 3;
    return `${Math.abs(lat).toFixed(fixed)}°${lat >= 0 ? 'N' : 'S'}，${Math.abs(lon).toFixed(fixed)}°${lon >= 0 ? 'E' : 'W'}`;
  }

  function wavePixelSize(depth) {
    const value = Number(depth);
    if (!Number.isFinite(value)) return 118;
    return Math.max(96, Math.min(220, 96 + value * 1.4));
  }

  function formatTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const time = date.toLocaleString(documentLanguage(), { hour12: false });
    return `${time} ${timeZoneLabel(date).short}`;
  }

  function formatTimeWithZone(value, compact = false) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const time = date.toLocaleString(documentLanguage(), { hour12: false });
    const zone = timeZoneLabel(date);
    if (compact === 'stacked') return `${time.replace(/\s+/, '\n')} ${zone.short}`;
    return `${time} ${zone.short}`;
  }

  function documentLanguage() {
    return typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en')
      ? 'en-US'
      : 'zh-CN';
  }

  function timeZoneLabel(date) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TIME_ZONE_LABELS[timeZone]) return TIME_ZONE_LABELS[timeZone];
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(date)
        .find(item => item.type === 'timeZoneName');
      const short = part && part.value ? part.value : timeZone || 'LOCAL';
      return { short, full: timeZone ? `${timeZone.replace(/_/g, ' ')} 时间` : '本地时间' };
    } catch (_error) {
      return { short: 'LOCAL', full: '本地时间' };
    }
  }

  function formatCountdown(seconds, expiredLabel = '已到达') {
    if (seconds === undefined || seconds === null || !Number.isFinite(Number(seconds))) return '--';
    const rounded = Math.round(Number(seconds));
    return rounded <= 0 ? expiredLabel : `${rounded} 秒`;
  }

  function taiwanLocationLayout(value, source) {
    const text = String(value || '').trim();
    const sourceText = typeof source === 'object' && source
      ? `${source.source || ''} ${source.sourceLabel || ''}`
      : String(source || '');
    if (!text || !/(?:cwa_taiwan|中国台湾\s*CWA|中央气象署)/i.test(sourceText)) return null;

    const qualifierMatch = text.match(/^(.*?)\s*[（(]\s*(位于.+?)\s*[）)]\s*$/);
    const main = String(qualifierMatch ? qualifierMatch[1] : text).trim();
    const detail = main.match(/^(.+?政府)\s*([东南西北中偏]+方)\s*([0-9]+(?:\.[0-9]+)?)\s*公里$/);
    const primaryLine = detail
      ? `${detail[1]} ${detail[2]} ${detail[3]} 公里`
      : main;
    const lines = [primaryLine || text];
    if (qualifierMatch && qualifierMatch[2]) lines.push(`（${qualifierMatch[2].trim()}）`);
    return {
      source: 'cwa_taiwan',
      fullText: text,
      lines
    };
  }

  function liveChannelStatus(connectedCount, serverConnectionState, hasFreshSourceSnapshot, minHealthy = 4) {
    const connected = Math.max(0, Math.floor(Number(connectedCount) || 0));
    const threshold = Math.max(1, Math.floor(Number(minHealthy) || 4));
    if (hasFreshSourceSnapshot) {
      if (connected >= threshold) {
        return { status: 'connected', tone: 'connected', label: '实时通道已连接' };
      }
      if (connected > 0) {
        return { status: 'connecting', tone: 'warning', label: '实时通道正在连接' };
      }
      return { status: 'closed', tone: 'offline', label: '实时通道未连接' };
    }
    return serverConnectionState === 'disconnected'
      ? { status: 'closed', tone: 'offline', label: '实时通道未连接' }
      : { status: 'connecting', tone: 'warning', label: '正在连接服务器' };
  }

  return {
    SOURCES,
    BACKUP_SOURCES,
    ALL_SOURCES,
    MAP_SOURCES,
    AMAP_TILE_URL,
    AMAP_SAMPLE_TILE_URL,
    AMAP_ATTRIBUTION,
    AREA_OPTIONS,
    standardizePlaceName,
    normalizeEarthquakeData,
    getEventKey,
    isRealEarthquake,
    matchesArea,
    calculateDistanceKm,
    estimateCountdown,
    estimateWaveCountdowns,
    estimateEpicenterIntensity,
    estimateLocalIntensity,
    intensityColor,
    formatIntensitySummary,
    magnitudeIntensity,
    formatNumber,
    formatCoordinatePair,
    wavePixelSize,
    formatTime,
    formatTimeWithZone,
    formatCountdown,
    taiwanLocationLayout,
    liveChannelStatus
  };
});
