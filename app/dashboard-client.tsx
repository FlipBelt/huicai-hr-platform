'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type DingTalkDepartment = { id:string; name:string; parentId:string; order:number; managerIds:string[]; managerNames:string[] };
type RosterStatus = '在职'|'兼职'|'离职';
type DingTalkEmployee = { id:string; name:string; nickname:string; title:string; departmentIds:string[]; employeeType:string; employeeStatus:string; rosterStatus:RosterStatus; hireDate:string; regularDate:string; certificateNoMasked:string; departureDate?:string };
type DingTalkData = { source:string; organizationName:string; syncedAt:string; departments:DingTalkDepartment[]; employees:DingTalkEmployee[] };
type OrgChartNode = DingTalkDepartment & { children:OrgChartNode[] };
type RecruitmentRequestItem = { id:string;departmentId:string;departmentName:string;positionName:string;demandType:string;currentHeadcount:number;approvedHeadcount:number;remainingHeadcount:number;capacityLabel:string;status:string;statusLabel:string;headcountNeeded:number;createdAt:string };
type RecruitmentTodo = { id:string;type:string;title:string;description:string;count:number;requestId?:string };
type RecruitmentDashboardData = { summary:{openPositions:number;openPositionsMoM:number;pendingApprovals:number;capacityWarnings:number;pendingTodos:number;stalePositions:number};todos:RecruitmentTodo[];warningDepartments:Array<{departmentId:string;departmentName:string;remainingHeadcount:number}>;demandTypes:string[];positionOptions:string[];departments:Array<{id:string;name:string}>;count:number;page:number;pageSize:number;next:number|null;previous:number|null;results:RecruitmentRequestItem[] };
type StaffingEmployee = { id:string;name:string;department:string;hireDate:string };
type StaffingItem = { departmentId:string;departmentName:string;approvedHeadcount:number;currentHeadcount:number;remainingHeadcount:number;status:string;updatedAt:string;employees:StaffingEmployee[] };
type RosterProfile = Record<string,string>;
type RosterField = { key:string;label:string;auto?:boolean };

const navGroups = [
  { label:'组织管理', items:[[0,'工作台','⌂'],[1,'人力资源规划','组'],[2,'招聘与配置','招'],[3,'培训与发展','学'],[4,'绩效管理','绩'],[5,'薪酬福利','薪'],[6,'劳动关系','合'],[8,'假勤管理','勤'],[7,'数据报表','数']] },
] as const;

const tasks = [
  { type: '入职', title: '确认陈思远入职资料', meta: '产品中心 · 明天入职', tone: 'orange' },
  { type: '审批', title: '审批 3 月绩效目标', meta: '6 个团队待确认', tone: 'blue' },
  { type: '合同', title: '处理即将到期合同', meta: '本月共 8 人', tone: 'purple' },
];

const moduleContent = [
  { title:'人力资源规划', subtitle:'统一组织架构与人才盘点，让人力配置与业务规划保持一致', stats:[['组织单元','26'],['关键岗位','48'],['人才梯队覆盖','76%']], tabs:['组织架构','岗位体系','人才盘点'], rows:[['产品中心','86 人','林屿','正常'],['销售中心','104 人','赵一鸣','扩编中'],['研发中心','98 人','唐嘉','正常'],['职能平台','40 人','周书言','正常']] },
  { title:'招聘与配置', subtitle:'从职位发布到 Offer 与入职，人才数据自动沉淀到员工档案', stats:[['开放职位','24'],['本月候选人','186'],['待入职','11']], tabs:['招聘看板','候选人','职位管理'], rows:[['高级产品经理','产品中心','18 位候选人','面试中'],['前端开发工程师','研发中心','32 位候选人','筛选中'],['大客户经理','销售中心','12 位候选人','Offer'],['HRBP','职能平台','9 位候选人','面试中']] },
  { title:'培训与发展', subtitle:'学习计划、课程与绩效结果联动，形成员工成长闭环', stats:[['进行中项目','8'],['本月学习人数','236'],['完成率','84%']], tabs:['培训项目','课程中心','学习记录'], rows:[['新经理启航营','管理力','46 人','进行中'],['产品思维训练','专业力','82 人','报名中'],['数据安全必修课','合规','328 人','84% 完成'],['客户成功工作坊','业务力','35 人','已结束']] },
  { title:'绩效管理', subtitle:'目标、评估、校准全流程在线，结果自动联动薪酬与发展', stats:[['评估周期','2026 Q3'],['参评人数','312'],['提交进度','86%']], tabs:['绩效周期','目标管理','校准分析'], rows:[['产品中心 Q3 绩效','季度考核','82 / 86','校准中'],['研发中心 Q3 绩效','季度考核','91 / 98','评估中'],['销售中心 8 月绩效','月度考核','96 / 104','提交中'],['管理层半年度盘点','半年考核','18 / 18','已完成']] },
  { title:'薪酬福利', subtitle:'员工、考勤与绩效数据自动汇入核算，减少重复导入', stats:[['本月核算人数','328'],['待确认异常','6'],['预计发薪日','09/05']], tabs:['薪酬核算','调薪管理','福利方案'], rows:[['2026 年 8 月工资单','全公司','328 人','核算中'],['销售佣金核算','销售中心','104 人','待确认'],['Q3 调薪方案','核心人才','38 人','审批中'],['年度体检福利','全公司','316 人参加','已完成']] },
  { title:'劳动关系', subtitle:'合同、入转调离与员工档案在线贯通，关键节点自动提醒', stats:[['电子合同','326'],['本月待续签','8'],['流程处理中','14']], tabs:['员工异动','合同管理','档案中心'], rows:[['陈思远入职','产品中心','2026/08/28','待确认'],['王若溪转岗','研发中心 → 产品中心','2026/09/01','审批中'],['8 份合同续签','跨部门','2026/08/31','待处理'],['赵可欣离职','销售中心','2026/09/05','交接中']] },
  { title:'数据报表', subtitle:'汇聚全模块人力数据，以管理驾驶舱与主题分析支持业务决策', stats:[['预置报表','36'],['本月浏览','1,286'],['风险预警','5']], tabs:['管理驾驶舱','主题分析','自定义报表'], rows:[['人力结构分析','组织人事','今日 09:20','已更新'],['人才流动趋势','员工关系','今日 08:45','已更新'],['人工成本分析','薪酬福利','昨日 18:30','已更新'],['招聘效能分析','招聘配置','昨日 17:10','已更新']] },
  { title:'假勤管理', subtitle:'规则、排班、出勤与休假一体化，结果直接进入薪酬核算', stats:[['今日出勤率','96.8%'],['考勤异常','12'],['待审批休假','7']], tabs:['考勤看板','排班管理','假期管理'], rows:[['今日考勤汇总','全公司','318 / 328','正常'],['产品中心弹性班次','产品中心','86 人','生效中'],['销售中心外勤规则','销售中心','104 人','生效中'],['8 月考勤封账','全公司','08/31','待处理']] },
  { title:'人才盘点', subtitle:'贯通绩效、能力与潜力数据，识别关键人才并管理继任梯队', stats:[['盘点人数','186'],['关键人才','42'],['继任覆盖率','72%']], tabs:['九宫格盘点','继任计划','人才池'], rows:[['2026 核心人才盘点','中层及核心岗位','186 人','进行中'],['产品总监继任计划','产品中心','3 位候选人','待校准'],['研发骨干人才池','研发中心','24 人','已更新'],['销售管理梯队','销售中心','18 人','评估中']] },
  { title:'员工服务', subtitle:'面向员工的一站式自助服务，集中处理证明、档案与福利申请', stats:[['本月服务单','286'],['自助办结率','91%'],['平均响应','1.8h']], tabs:['服务大厅','我的申请','知识中心'], rows:[['在职证明申请','电子证明','今日 10:12','已办结'],['个人信息变更','员工档案','今日 09:48','处理中'],['福利积分兑换','员工福利','昨日 17:32','已办结'],['社保公积金咨询','政策咨询','昨日 15:20','待回复']] },
  { title:'流程中心', subtitle:'统一编排与监控跨模块人事流程，让业务状态全程可追踪', stats:[['运行中流程','46'],['今日办结','28'],['平均时效','6.4h']], tabs:['流程监控','我的审批','流程设计'], rows:[['陈思远入职流程','招聘 → 人事 → 合同','6 / 8 节点','处理中'],['王若溪转岗流程','组织 → 薪酬 → 权限','3 / 5 节点','审批中'],['Q3 调薪审批','绩效 → 薪酬','18 / 38 人','处理中'],['销售离职交接','员工关系 → IT → 财务','4 / 6 节点','待处理']] },
];

const recruitingContent:Record<string,{subtitle:string;action:string;metrics:Array<[string,string,string]>;columns:string[];rows:string[][];insight:string}> = {
  '招聘需求':{
    subtitle:'汇总各部门招聘需求、岗位类型与编制余额，提前识别超编风险',action:'新建招聘需求',
    metrics:[['在招岗位数','9','覆盖 6 个部门'],['新增编制','3','本月已审批'],['离职补缺','2','优先补充'],['编制余额预警','2','需要及时处理']],
    columns:['部门 / 在招岗位','岗位类型','在招人数','编制余额','状态'],
    rows:[['营销中心 · 品牌策划经理','新增编制','2','1','招聘中'],['电商前台 · 京东运营','离职补缺','1','0','余额预警'],['内容中台 · 短视频编导','优化替换','2','0','余额预警'],['人事行政部 · 招聘专员','其他原因','1','1','待审批']],
    insight:'电商前台与内容中台的编制余额已用尽，继续发布职位前需完成编制审批。'
  },
  '职位管理':{
    subtitle:'统一查看各招聘渠道的职位数量、发布状态与内部推荐效果',action:'发布职位',
    metrics:[['招聘渠道','5','统一管理'],['在招职位','14','较上月 +3'],['已发布职位','11','发布率 78.6%'],['内推候选人','28','本月新增 9']],
    columns:['招聘渠道','在招职位数','职位发布状态','内推数据','状态'],
    rows:[['BOSS直聘','6','已发布 6','—','正常'],['智联招聘','3','已发布 2 / 草稿 1','—','待完善'],['猎聘','2','已发布 2','—','正常'],['内部推荐','3','已发布 3','28 份 · 6 人进入面试','高活跃']],
    insight:'内部推荐渠道的面试转化率最高，建议优先补充京东运营与短视频编导的内推激励。'
  },
  '简历库':{
    subtitle:'集中沉淀各渠道候选人简历，并通过 AI 匹配评分提升筛选效率',action:'导入简历',
    metrics:[['简历总量','1,286','全渠道累计'],['待处理简历','46','今日新增 12'],['AI 高匹配','38','评分 ≥ 80'],['平均匹配度','76%','较上周 +4%']],
    columns:['简历来源','简历总量','待处理简历数','AI 匹配度评分','最近更新'],
    rows:[['BOSS直聘','486','18','82 分','刚刚'],['智联招聘','328','12','74 分','10 分钟前'],['猎聘','206','5','86 分','今天 09:30'],['内部推荐','96','4','89 分','今天 08:45']],
    insight:'内部推荐与猎聘的 AI 平均匹配度领先，待处理简历优先按匹配度从高到低分配。'
  },
  '面试管理':{
    subtitle:'统筹候选人面试进度、通过率和面试官日程，减少协调等待',action:'安排面试',
    metrics:[['待面试人数','18','未来 7 天'],['今日面试','6','3 场待确认'],['面试通过率','42%','近 30 天'],['日程待同步','3','面试官冲突']],
    columns:['岗位','待面试人数','面试通过率','面试官日程','状态'],
    rows:[['品牌策划经理','4','50%','负责人 A · 明天 10:00','已同步'],['京东运营','3','33%','负责人 B · 明天 14:00','已同步'],['短视频编导','6','46%','负责人 A · 2 场冲突','待协调'],['招聘专员','2','50%','负责人 C · 周五 15:30','已同步']],
    insight:'短视频编导存在 2 场面试官日程冲突，建议调整到周四下午的可用时段。'
  },
  'Offer管理':{
    subtitle:'跟踪 Offer 发放、审批、接受及入职准备，确保候选人顺利转化',action:'新建 Offer',
    metrics:[['待发 Offer','4','需确认薪资'],['待审批 Offer','2','今日需处理'],['Offer 接受率','78%','近 90 天'],['入职待办','6','未来 14 天']],
    columns:['候选岗位','待发 / 待审批','Offer 接受率','入职待办清单','状态'],
    rows:[['品牌策划经理','待发 1','80%','资料 2 / 4','待确认'],['京东运营','待审批 1','75%','资料 3 / 4','审批中'],['短视频编导','待发 2','67%','资料 1 / 4','待跟进'],['招聘专员','待审批 1','100%','资料 4 / 4','准备入职']],
    insight:'2 份 Offer 已接近候选人约定反馈时间，建议今天完成审批并确认入职日期。'
  }
};

function ReportView() {
  const [period,setPeriod] = useState('本月');
  return <div className="report-view">
    <div className="module-title"><div><p className="eyebrow">People Analytics</p><h1>数据报表</h1><p>跨模块归集人力与业务数据，统一指标口径，及时发现组织风险。</p></div><div className="report-actions"><select value={period} onChange={e=>setPeriod(e.target.value)}><option>本月</option><option>本季度</option><option>本年度</option></select><button className="primary-btn">＋ 新建报表</button></div></div>
    <div className="report-tabs"><button className="active">管理驾驶舱</button><button>主题分析</button><button>自定义报表</button><button>数据订阅</button></div>
    <section className="stats-grid report-kpis"><article className="stat-card"><p>期末在职人数</p><strong>328</strong><span className="note up-text">较期初 +2.4%</span></article><article className="stat-card"><p>主动离职率</p><strong>1.8<span className="unit">%</span></strong><span className="note">低于预警线 0.7%</span></article><article className="stat-card"><p>人均人工成本</p><strong>¥18.6<span className="unit">k</span></strong><span className="note">预算执行 82%</span></article><article className="stat-card"><p>人均产出</p><strong>¥126<span className="unit">k</span></strong><span className="note up-text">环比 +6.2%</span></article></section>
    <div className="report-grid"><section className="panel line-panel"><div className="panel-head"><div><h2>人员规模与流动趋势</h2><p>{period} · 全公司</p></div><button>查看分析 →</button></div><div className="line-chart"><div className="chart-line line-one"/><div className="chart-line line-two"/>{[310,314,318,321,324,328].map((n,i)=><div className="line-point" style={{left:`${8+i*17}%`,bottom:`${25+(n-310)*2.4}%`}} key={n}><i/><span>{i===5?n:''}</span></div>)}<div className="axis-labels">{['3月','4月','5月','6月','7月','8月'].map(x=><span key={x}>{x}</span>)}</div></div><div className="chart-legend"><span><i className="legend-blue"/>在职人数</span><span><i className="legend-orange"/>离职人数</span></div></section><section className="panel structure-panel"><div className="panel-head"><div><h2>人才结构</h2><p>年龄与职级分布</p></div><button>详情 →</button></div><div className="donut"><div><strong>328</strong><span>员工总数</span></div></div><div className="donut-legend"><span><i/>25 岁以下 <b>18%</b></span><span><i/>26–35 岁 <b>52%</b></span><span><i/>36–45 岁 <b>24%</b></span><span><i/>46 岁以上 <b>6%</b></span></div></section></div>
    <section className="panel insight-panel"><div><span className="insight-icon">!</span><div><h3>智能洞察与预警</h3><p>本月研发中心核心岗位离职风险较上月上升 3.2%，建议重点关注 5 名高绩效员工。</p></div></div><button>查看风险名单 →</button></section>
  </div>;
}

function ModuleView({ index }: { index:number }) {
  const data = moduleContent[index - 1];
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const filtered = data.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(query.toLowerCase())));
  return <div className="module-view">
    <div className="module-title"><div><p className="eyebrow">业务模块</p><h1>{data.title}</h1><p>{data.subtitle}</p></div><button className="primary-btn">＋ 新建</button></div>
    <section className="module-stats">{data.stats.map(([label,value]) => <article key={label}><p>{label}</p><strong>{value}</strong><span>实时同步</span></article>)}</section>
    <section className="panel data-panel">
      <div className="data-toolbar"><div className="tabs">{data.tabs.map((name,i)=><button className={tab===i?'active':''} onClick={()=>setTab(i)} key={name}>{name}</button>)}</div><label className="table-search">⌕ <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="筛选当前列表" /></label></div>
      <div className="data-table"><div className="table-row table-head"><span>项目 / 姓名</span><span>所属 / 类型</span><span>数据概览</span><span>状态</span><span>操作</span></div>{filtered.map((row)=><div className="table-row" key={row[0]}>{row.map((cell,i)=><span key={i} className={i===3?'status-pill':''}>{cell}</span>)}<button>查看详情</button></div>)}</div>
      {filtered.length===0&&<div className="empty">没有找到匹配的数据</div>}
    </section>
    <section className="connection-strip"><span className="pulse">●</span><div><strong>数据已贯通</strong><p>员工主数据、流程状态和分析指标在各模块间实时同步</p></div><div className="flow-nodes"><span>员工档案</span><i>→</i><span>{data.title}</span><i>→</i><span>数据分析</span></div></section>
  </div>;
}

function RecruitingView({ section }: { section:string }) {
  const data=recruitingContent[section]??recruitingContent['招聘需求'];
  const [query,setQuery]=useState('');
  useEffect(()=>setQuery(''),[section]);
  const filtered=data.rows.filter((row)=>row.some((cell)=>cell.toLowerCase().includes(query.trim().toLowerCase())));
  return <div className="recruiting-view">
    <div className="module-title recruiting-title"><div><p className="eyebrow">RECRUITMENT MANAGEMENT</p><div className="title-line"><h1>{section}</h1><span className="recruiting-badge">招聘全流程</span></div><p>{data.subtitle}</p></div><button className="primary-btn"><span>＋</span> {data.action}</button></div>
    <section className="module-stats recruiting-stats">{data.metrics.map(([label,value,note],index)=><article key={label} className={index===data.metrics.length-1?'warning-metric':''}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>)}</section>
    <section className="panel recruiting-panel">
      <div className="data-toolbar"><div><h2>{section}看板</h2><p>当前招聘流程关键数据</p></div><label className="table-search">⌕ <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="筛选当前列表"/></label></div>
      <div className="recruiting-table"><div className="recruiting-row recruiting-head">{data.columns.map((column)=><span key={column}>{column}</span>)}<span>操作</span></div>{filtered.map((row)=><div className="recruiting-row" key={row[0]}>{row.map((cell,index)=><span className={index===row.length-1?'recruit-status':''} key={index}>{cell}</span>)}<button>查看详情</button></div>)}</div>
      {filtered.length===0&&<div className="empty">没有找到匹配的数据</div>}
    </section>
    <section className="recruiting-insight"><span>!</span><div><strong>招聘提醒</strong><p>{data.insight}</p></div><button>立即处理 →</button></section>
  </div>;
}

function RecruitmentDashboardView() {
  const [data,setData]=useState<RecruitmentDashboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [demandType,setDemandType]=useState('全部');
  const [recruitmentDepartment,setRecruitmentDepartment]=useState('全部');
  const [statusFilter,setStatusFilter]=useState('');
  const [ordering,setOrdering]=useState('-created_at');
  const [page,setPage]=useState(1);
  const [todoFocus,setTodoFocus]=useState('');
  const [showWarnings,setShowWarnings]=useState(false);
  const [selected,setSelected]=useState<RecruitmentRequestItem|null>(null);

  async function load() {
    setLoading(true);setError('');
    const query=new URLSearchParams({page:String(page),page_size:'8',ordering});
    if(demandType!=='全部')query.set('demand_type',demandType);
    if(recruitmentDepartment!=='全部')query.set('department_id',recruitmentDepartment);
    if(statusFilter)query.set('status',statusFilter);
    try {
      let response=await fetch(`/api/recruitment/dashboard?${query}`,{cache:'no-store'});
      if(response.status===503){await fetch('/api/dingtalk',{cache:'no-store'});response=await fetch(`/api/recruitment/dashboard?${query}`,{cache:'no-store'})}
      const result=await response.json();if(!response.ok)throw new Error(result.error||'招聘数据暂时不可用');setData(result);
    } catch(loadError){setError(loadError instanceof Error?loadError.message:'招聘数据暂时不可用')} finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[demandType,recruitmentDepartment,statusFilter,ordering,page]);

  async function updateRequest(input:{id:string;action?:string;demandType?:string}) {
    const response=await fetch('/api/recruitment/dashboard',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    if(response.ok){setSelected(null);await load()} else setError('招聘需求更新失败');
  }
  function scrollTo(id:string){requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function focusTodos(type:string){setTodoFocus(type);scrollTo('recruitment-attention')}
  function handleTodo(todo:RecruitmentTodo){
    if(todo.type==='approval'){setStatusFilter('PENDING_APPROVAL');setPage(1);scrollTo('recruitment-list')}
    else if(todo.type==='capacity'){setShowWarnings(true);scrollTo('recruitment-attention')}
    else {setStatusFilter('RECRUITING');setOrdering('created_at');setPage(1);scrollTo('recruitment-list')}
  }
  const visibleTodos=(data?.todos??[]).filter((todo)=>!todoFocus||todo.type===todoFocus);
  return <div className="recruitment-dashboard">
    <div className="module-title recruitment-dashboard-title"><div><p className="eyebrow">RECRUITMENT DASHBOARD</p><div className="title-line"><h1>招聘需求</h1><span className="recruiting-badge">数据联动</span></div><p>联动招聘审批、编制管理与钉钉花名册，统一管理招聘需求。</p></div><button className="primary-btn"><span>＋</span> 新建招聘需求</button></div>
    {loading&&!data?<section className="sync-state recruitment-loading"><span className="sync-spinner"/><strong>正在汇总招聘数据</strong></section>:error&&!data?<section className="sync-state error-state"><span>!</span><strong>招聘数据读取失败</strong><p>{error}</p><button onClick={()=>void load()}>重新加载</button></section>:data&&<>
      <section className="recruitment-kpis">
        <article><p>在招岗位数</p><strong>{data.summary.openPositions}</strong><span className={data.summary.openPositionsMoM>=0?'positive':'negative'}>较上月 {data.summary.openPositionsMoM>=0?'+':''}{data.summary.openPositionsMoM}</span></article>
        <button onClick={()=>focusTodos('approval')}><p>待审批需求</p><strong>{data.summary.pendingApprovals}</strong><span>查看审批列表 →</span></button>
        <button onClick={()=>{setShowWarnings((value)=>!value);focusTodos('capacity')}}><p>编制余额预警</p><strong>{data.summary.capacityWarnings}</strong><span>展开预警明细 →</span></button>
        <button onClick={()=>{setTodoFocus('');scrollTo('recruitment-attention')}}><p>待处理待办</p><strong>{data.summary.pendingTodos}</strong><span>{data.summary.stalePositions} 个岗位超 7 天未关</span></button>
      </section>
      <section className="panel attention-panel" id="recruitment-attention"><div className="attention-head"><div><h2>待关注事项 <b>{data.summary.pendingTodos}</b></h2><p>根据审批、编制与招聘时效自动生成</p></div>{todoFocus&&<button onClick={()=>setTodoFocus('')}>查看全部</button>}</div>
        {showWarnings&&<div className="capacity-warning-list">{data.warningDepartments.map((warning)=><span key={warning.departmentId}><strong>{warning.departmentName}</strong>{warning.remainingHeadcount<0?`超编 ${Math.abs(warning.remainingHeadcount)} 人`:'已满编'}</span>)}</div>}
        <div className="attention-list">{visibleTodos.map((todo)=><button key={todo.id} onClick={()=>handleTodo(todo)}><i className={`attention-icon ${todo.type}`}>{todo.type==='approval'?'审':todo.type==='capacity'?'编':'时'}</i><div><strong>{todo.title}</strong><p>{todo.description}</p></div><span>立即处理 →</span></button>)}{visibleTodos.length===0&&<div className="empty">当前没有此类待关注事项</div>}</div>
      </section>
      <section className="panel recruitment-list-panel" id="recruitment-list"><div className="recruitment-list-head"><div><h2>招聘需求列表</h2><p>共 {data.count} 条需求，岗位名称与花名册岗位体系保持一致</p></div><label>排序<select value={ordering} onChange={(event)=>{setOrdering(event.target.value);setPage(1)}}><option value="-created_at">创建时间（最新）</option><option value="created_at">创建时间（最早）</option><option value="department_name">部门名称</option><option value="remaining_headcount">剩余编制（升序）</option></select></label></div>
        <div className="department-filter-bar"><strong>选择部门：</strong><button className={recruitmentDepartment==='全部'?'active':''} onClick={()=>{setRecruitmentDepartment('全部');setPage(1)}}>全部</button>{data.departments.map((department)=><button className={recruitmentDepartment===department.id?'active':''} onClick={()=>{setRecruitmentDepartment(department.id);setPage(1)}} key={department.id}>{department.name}</button>)}</div>
        <div className="demand-filters">{['全部',...(data.demandTypes??[])].map((type)=><button className={demandType===type?'active':''} onClick={()=>{setDemandType(type);setStatusFilter('');setPage(1)}} key={type}>{type}</button>)}{statusFilter&&<button className="clear-status-filter" onClick={()=>{setStatusFilter('');setPage(1)}}>清除状态筛选 ×</button>}</div>
        <div className="recruitment-demand-table"><div className="demand-row demand-head"><span>部门名称</span><span>招聘岗位</span><span>需求类型</span><span>当前在职人数</span><span>剩余编制数</span><span>状态标签</span><span>操作</span></div>{data.results.map((item)=><div className="demand-row" key={item.id}><span><strong>{item.departmentName}</strong></span><span>{item.positionName}</span><span><select aria-label={`${item.positionName}需求类型`} value={item.demandType} disabled={item.status==='CLOSED'} onChange={(event)=>void updateRequest({id:item.id,demandType:event.target.value})}>{data.demandTypes.map((type)=><option key={type}>{type}</option>)}</select></span><span>{item.currentHeadcount} 人</span><span className={item.remainingHeadcount<=0?'capacity-negative':''}>{item.remainingHeadcount} {item.capacityLabel&&<em>{item.capacityLabel}</em>}</span><span><i className={`demand-status status-${item.statusLabel}`}>{item.statusLabel}</i></span><span className="demand-actions"><button onClick={()=>setSelected(item)}>查看详情</button><button onClick={()=>setSelected(item)}>编辑</button><button disabled={item.status==='CLOSED'} onClick={()=>void updateRequest({id:item.id,action:'close'})}>关闭需求</button></span></div>)}</div>
        {data.results.length===0&&<div className="empty">当前筛选条件下没有招聘需求</div>}
        <div className="recruitment-pagination"><span>第 {data.page} 页 · 共 {Math.max(1,Math.ceil(data.count/data.pageSize))} 页</span><div><button disabled={!data.previous} onClick={()=>setPage(data.previous??1)}>上一页</button><button disabled={!data.next} onClick={()=>setPage(data.next??page)}>下一页</button></div></div>
      </section>
    </>}
    {selected&&<div className="dept-modal-backdrop" onClick={()=>setSelected(null)}><section className="dept-modal request-modal" onClick={(event)=>event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">招聘需求详情</p><h2>{selected.positionName}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div className="request-detail-grid"><span>部门名称<strong>{selected.departmentName}</strong></span><span>当前在职人数<strong>{selected.currentHeadcount} 人</strong></span><span>核定编制<strong>{selected.approvedHeadcount} 人</strong></span><span>剩余编制数<strong>{selected.remainingHeadcount} 人</strong></span><label>需求类型<select value={selected.demandType} onChange={(event)=>setSelected({...selected,demandType:event.target.value})}>{data?.demandTypes.map((type)=><option key={type}>{type}</option>)}</select></label><span>创建时间<strong>{selected.createdAt.slice(0,10)}</strong></span></div><div className="request-modal-actions"><button onClick={()=>setSelected(null)}>取消</button><button onClick={()=>void updateRequest({id:selected.id,demandType:selected.demandType})}>保存修改</button></div></section></div>}
  </div>;
}

function isCompanyDepartment(department:DingTalkDepartment) {
  return department.name.includes('有限公司');
}

function buildOrgChart(departments:DingTalkDepartment[]) {
  const byParent = new Map<string,DingTalkDepartment[]>();
  for (const department of departments) {
    const siblings = byParent.get(department.parentId) ?? [];
    siblings.push(department);
    byParent.set(department.parentId, siblings);
  }

  function visit(parentId:string, ancestors:Set<string>):OrgChartNode[] {
    const result:OrgChartNode[] = [];
    const children = [...(byParent.get(parentId) ?? [])].sort((a,b)=>a.order-b.order);
    for (const department of children) {
      if (ancestors.has(department.id)) continue;
      const nextAncestors = new Set(ancestors).add(department.id);
      const descendants = visit(department.id, nextAncestors);
      if (isCompanyDepartment(department)) result.push(...descendants);
      else result.push({ ...department, children:descendants });
    }
    return result;
  }

  return visit('1', new Set());
}

function descendantDepartmentIds(node:OrgChartNode) {
  const departmentIds = new Set<string>();
  function collect(current:OrgChartNode) {
    departmentIds.add(current.id);
    current.children.forEach(collect);
  }
  collect(node);
  return departmentIds;
}

function chartNodeEmployees(node:OrgChartNode, employees:DingTalkEmployee[]) {
  const departmentIds = descendantDepartmentIds(node);
  return employees.filter((employee)=>employee.rosterStatus!=='离职'&&employee.departmentIds.some((id)=>departmentIds.has(id)));
}

function OrgChartBranch({ nodes, employees, onSelect }: { nodes:OrgChartNode[]; employees:DingTalkEmployee[]; onSelect:(node:OrgChartNode)=>void }) {
  if (nodes.length === 0) return null;
  return <ul>{nodes.map((node)=><li key={node.id}>
    <button className="org-chart-node" onClick={()=>onSelect(node)}><span className="org-node-icon">{node.name.slice(0,1)}</span><strong>{node.name}</strong><small>{chartNodeEmployees(node,employees).length} 人</small><em>负责人：{node.managerNames.join('、')||'未设置'}</em></button>
    <OrgChartBranch nodes={node.children} employees={employees} onSelect={onSelect}/>
  </li>)}</ul>;
}

const DINGTALK_SESSION_TTL = 10 * 60 * 1000;
const DINGTALK_CURRENT_CACHE = 'hr-dingtalk-current-v5';
const DINGTALK_DEPARTED_CACHE = 'hr-dingtalk-departed-v5';
const ROSTER_DEPARTMENT_ORDER = ['内容中台','市场前台','电商前台','采购仓储部','产品设计','信息技术部','客户运营','人事行政部','财务部'];
const ROSTER_FILTER_ORDER = ['总裁办','营销中心',...ROSTER_DEPARTMENT_ORDER];
const ROSTER_GROUP_ORDER = ['营销中心','内容中台','市场前台','电商前台','采购仓储部','产品设计','信息技术部','客户运营','总裁办','人事行政部','财务部'];
const ROSTER_MONTH_START = '2026-09';

function readDingTalkSession(key:string) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { savedAt?:number; data?:DingTalkData } | null;
    return stored?.savedAt && stored.data && Date.now() - stored.savedAt < DINGTALK_SESSION_TTL ? stored.data : null;
  } catch { return null; }
}

function mergeEmployees(current:DingTalkEmployee[], incoming:DingTalkEmployee[]) {
  return [...new Map([...current,...incoming].map((employee)=>[employee.id,employee])).values()];
}

const employeeRosterFields:RosterField[] = [
  {key:'name',label:'姓名',auto:true},{key:'nickname',label:'花名',auto:true},{key:'center',label:'中心',auto:true},{key:'department',label:'部门',auto:true},{key:'title',label:'岗位',auto:true},
  {key:'certificateNo',label:'身份证号码'},{key:'mobile',label:'手机号'},{key:'hireDate',label:'入职日期',auto:true},{key:'regularDate',label:'转正日期'},{key:'birthday',label:'生日'},{key:'age',label:'年龄'},{key:'gender',label:'性别'},{key:'maritalStatus',label:'婚否'},{key:'ethnicity',label:'民族'},
  {key:'contractStart',label:'合同开始日期'},{key:'contractEnd',label:'合同结束日期'},{key:'contractType',label:'合同类型'},{key:'contractCompany',label:'合同公司'},{key:'socialSecurity',label:'社保缴费情况'},{key:'housingFund',label:'公积金缴费情况'},{key:'officeLocation',label:'办公地点'},
  {key:'workStartDate',label:'参加工作时间'},{key:'education',label:'学历'},{key:'school',label:'毕业学校'},{key:'major',label:'专业'},{key:'householdType',label:'户口性质'},{key:'idAddress',label:'身份证地址'},{key:'residentialAddress',label:'居住住址'},
  {key:'bankCard',label:'银行卡卡号'},{key:'bankName',label:'开户行'}
];
const partTimeRosterFields:RosterField[] = [
  {key:'name',label:'姓名',auto:true},{key:'nickname',label:'花名',auto:true},{key:'contractTime',label:'合同时间'},{key:'center',label:'中心',auto:true},{key:'department',label:'部门',auto:true},{key:'title',label:'岗位',auto:true},{key:'certificateNo',label:'身份证号码'},{key:'mobile',label:'联系电话'},{key:'bankCard',label:'银行卡号'},{key:'bankName',label:'开户行'},{key:'notes',label:'备注'}
];
const departedRosterFields:RosterField[] = [
  ...employeeRosterFields.slice(0,5),
  {key:'departureDate',label:'离职时间',auto:true},
  {key:'departureType',label:'离职类型'},
  {key:'departureReason',label:'离职原因'},
  ...employeeRosterFields.slice(5),
];

function splitPersonName(value:string) {
  const parts=value.split(/[-—–]/).map((item)=>item.trim()).filter(Boolean);
  return parts.length>=2?{nickname:parts[0],realName:parts.slice(1).join('-')}:{nickname:'',realName:value.trim()};
}

function employeePlacement(employee:DingTalkEmployee,departments:DingTalkDepartment[]) {
  const byId=new Map(departments.map((department)=>[department.id,department]));
  const depth=(id:string)=>{let count=0;let current=byId.get(id);const seen=new Set<string>();while(current&&!seen.has(current.id)){seen.add(current.id);count+=1;current=byId.get(current.parentId)}return count};
  const leafId=employee.departmentIds.filter((id)=>byId.has(id)).sort((a,b)=>depth(b)-depth(a))[0];
  const chain:DingTalkDepartment[]=[];let current=leafId?byId.get(leafId):undefined;const seen=new Set<string>();
  while(current&&!seen.has(current.id)){seen.add(current.id);if(!isCompanyDepartment(current))chain.unshift(current);current=byId.get(current.parentId)}
  const compact=chain.slice(-3);
  if(compact.length>=3)return {center:compact[0].name,department:compact[1].name,group:compact[2].name};
  if(compact.length===2)return {center:compact[0].name,department:compact[1].name,group:''};
  return {center:compact[0]?.name?'': '总裁办',department:compact[0]?.name??'总裁办',group:''};
}

function PersonnelRosterView({data,departedLoaded,departedLoading,departedError,onLoadDeparted}:{data:DingTalkData;departedLoaded:boolean;departedLoading:boolean;departedError:string;onLoadDeparted:()=>Promise<void>}) {
  const [tab,setTab]=useState<RosterStatus>('在职');
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const [departmentFilter,setDepartmentFilter]=useState('全部');
  const [profiles,setProfiles]=useState<Record<string,RosterProfile>>({});
  const [profileError,setProfileError]=useState('');
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<DingTalkEmployee|null>(null);
  const [draft,setDraft]=useState<RosterProfile>({});
  const [saving,setSaving]=useState(false);
  const refreshProfiles=async()=>{const response=await fetch('/api/roster',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setProfiles(result.profiles??{})};
  useEffect(()=>{void refreshProfiles().catch((reason)=>setProfileError(reason instanceof Error?reason.message:'扩展信息加载失败'))},[]);
  useEffect(()=>{if(departedLoaded)void refreshProfiles().catch((reason)=>setProfileError(reason instanceof Error?reason.message:'离职状态加载失败'))},[departedLoaded]);
  const fields=tab==='兼职'?partTimeRosterFields:tab==='离职'?departedRosterFields:employeeRosterFields;
  const normalizedRealName=(value:string)=>splitPersonName(value).realName.replace(/\s+/g,'').toLowerCase();
  const canonicalProfileNames=new Set(Object.entries(profiles).filter(([id,profile])=>!id.startsWith('excel:')&&profile.sourceName).map(([,profile])=>normalizedRealName(profile.sourceName)));
  const excelEmployees=Object.entries(profiles).filter(([id,profile])=>profile.sourceName&&(profile.sourceStatus!=='在职'||profile.manualActiveRoster==='1')&&(!id.startsWith('excel:')||!canonicalProfileNames.has(normalizedRealName(profile.sourceName)))).map(([id,profile])=>({id,name:profile.sourceName,nickname:'',title:profile.sourceTitle??'',departmentIds:[],employeeType:profile.sourceStatus==='兼职'?'兼职':'',employeeStatus:'',rosterStatus:(profile.sourceStatus??'在职') as RosterStatus,hireDate:profile.sourceHireDate??'',regularDate:profile.regularDate??'',certificateNoMasked:'',departureDate:profile.departureDate??''}));
  const allEmployees=mergeEmployees(excelEmployees,data.employees);
  const placementFor=(employee:DingTalkEmployee)=>{const profile=profiles[employee.id];const placement=employeePlacement(employee,data.departments);if(profile?.organizationOverride==='1')return {center:profile.sourceCenter??'',department:profile.sourceDepartment??'',group:profile.sourceGroup??''};const useProfile=employee.rosterStatus==='离职'||employee.id.startsWith('excel:')||!placement.center;return {center:useProfile&&profile?.sourceCenter?profile.sourceCenter:placement.center,department:useProfile&&profile?.sourceDepartment?profile.sourceDepartment:placement.department,group:useProfile&&profile?.sourceGroup?profile.sourceGroup:placement.group}};
  const identityFor=(employee:DingTalkEmployee)=>{const profile=profiles[employee.id];const parsed=splitPersonName(employee.name);return {realName:profile?.sourceName||parsed.realName,nickname:profile?.nickname||employee.nickname||parsed.nickname}};
  const autoValue=(employee:DingTalkEmployee,key:string)=>{const profile=profiles[employee.id];const sourcePreferred=profile?.titleOverride==='1'||employee.rosterStatus==='离职'||employee.id.startsWith('excel:');if(key==='name')return identityFor(employee).realName||'未填写';if(key==='nickname')return identityFor(employee).nickname||'未填写';if(key==='title')return sourcePreferred&&profile?.sourceTitle?profile.sourceTitle:(employee.title||'未填写');if(key==='hireDate')return sourcePreferred&&profile?.sourceHireDate?profile.sourceHireDate:(employee.hireDate||'未维护');if(key==='departureDate')return profile?.departureDate||employee.departureDate||'未维护';if(key==='center'||key==='department'||key==='group')return placementFor(employee)[key]||'—';return ''};
  const statusEmployees=allEmployees.filter((employee)=>employee.rosterStatus===tab);
  const recordDate=(employee:DingTalkEmployee)=>tab==='离职'?(profiles[employee.id]?.departureDate||employee.departureDate||''):(profiles[employee.id]?.sourceHireDate||employee.hireDate||'');
  const currentMonth=new Date().toISOString().slice(0,7);
  const monthOptions=[...new Set([currentMonth,...statusEmployees.map((employee)=>recordDate(employee).slice(0,7)).filter((value)=>/^\d{4}-\d{2}$/.test(value)&&value>=ROSTER_MONTH_START)])].filter((value)=>value>=ROSTER_MONTH_START).sort().reverse();
  const inSelectedMonth=(employee:DingTalkEmployee)=>{const date=recordDate(employee);if(tab==='离职')return date.slice(0,7)>=ROSTER_MONTH_START&&date.startsWith(month);return month>=ROSTER_MONTH_START&&(!date||date.slice(0,7)<=month)};
  const monthEmployees=statusEmployees.filter(inSelectedMonth);
  const groupLabel=(placement:{center:string;department:string})=>ROSTER_DEPARTMENT_ORDER.includes(placement.department)?placement.department:placement.center==='营销中心'?'营销中心':'总裁办';
  const matchesOrganizationFilter=(employee:DingTalkEmployee,filter:string)=>{const placement=placementFor(employee);if(filter==='全部')return true;if(filter==='总裁办'||filter==='营销中心')return groupLabel(placement)===filter;return placement.department===filter};
  const departmentOptions=ROSTER_FILTER_ORDER.filter((filter)=>monthEmployees.some((employee)=>matchesOrganizationFilter(employee,filter)));
  const departmentCounts=new Map(departmentOptions.map((filter)=>[filter,monthEmployees.filter((employee)=>matchesOrganizationFilter(employee,filter)).length]));
  const employees=monthEmployees.filter((employee)=>matchesOrganizationFilter(employee,departmentFilter)&&[identityFor(employee).realName,identityFor(employee).nickname,employee.title,profiles[employee.id]?.sourceCenter??'',profiles[employee.id]?.sourceDepartment??'',profiles[employee.id]?.sourceGroup??'',...employee.departmentIds.map((id)=>data.departments.find((department)=>department.id===id)?.name??'')].some((value)=>value.toLowerCase().includes(query.trim().toLowerCase()))).sort((left,right)=>{const leftGroup=groupLabel(placementFor(left)),rightGroup=groupLabel(placementFor(right));return ROSTER_GROUP_ORDER.indexOf(leftGroup)-ROSTER_GROUP_ORDER.indexOf(rightGroup)||identityFor(left).realName.localeCompare(identityFor(right).realName,'zh-CN')});
  const groupedEmployees=ROSTER_GROUP_ORDER.map((label)=>({label,employees:employees.filter((employee)=>groupLabel(placementFor(employee))===label)})).filter((group)=>group.employees.length>0);
  const counts=(['在职','兼职','离职'] as RosterStatus[]).map((status)=>[status,allEmployees.filter((employee)=>employee.rosterStatus===status).length] as const);
  useEffect(()=>setDepartmentFilter('全部'),[tab,month]);
  const value=(employee:DingTalkEmployee,field:RosterField)=>field.auto?autoValue(employee,field.key):(profiles[employee.id]?.[field.key]||'未填写');
  const openEditor=(employee:DingTalkEmployee)=>{setEditing(employee);setDraft({...profiles[employee.id]})};
  const save=async()=>{if(!editing)return;setSaving(true);setProfileError('');try{const response=await fetch('/api/roster',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({employeeId:editing.id,fields:draft})});const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');setProfiles((current)=>({...current,[editing.id]:result.profile}));setEditing(null)}catch(reason){setProfileError(reason instanceof Error?reason.message:'保存失败')}finally{setSaving(false)}};
  return <>
<section className="panel personnel-roster-panel"><div className="personnel-roster-head"><div><h2>人员名册</h2><p>在职人员由钉钉自动回写；退出后自动转入离职花名册，离职时间读取钉钉智能人事的离职日期</p></div><label className="table-search roster-search">⌕ <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索姓名、花名、部门或岗位"/></label></div><div className="roster-tabs personnel-tabs">{counts.map(([status,count])=><button className={tab===status?'active':''} onClick={()=>{setTab(status);if(status==='离职'&&!departedLoaded)void onLoadDeparted().then(refreshProfiles).catch((reason)=>setProfileError(reason instanceof Error?reason.message:'离职花名册加载失败'))}} key={status}>{status}花名册 <b>{status==='离职'&&departedLoading?'…':count}</b></button>)}</div><div className="roster-filter-bar"><strong>部门：</strong><button className={departmentFilter==='全部'?'active':''} onClick={()=>setDepartmentFilter('全部')}>全部 <b>{monthEmployees.length}</b></button>{departmentOptions.map((department)=><button className={departmentFilter===department?'active':''} onClick={()=>setDepartmentFilter(department)} key={department}>{department} <b>{departmentCounts.get(department)}</b></button>)}<label>月份<select value={month} onChange={(event)=>setMonth(event.target.value)}>{monthOptions.map((option)=><option value={option} key={option}>{option.replace('-','年')}月</option>)}</select></label></div>{profileError&&<div className="roster-alert">{profileError}</div>}<div className="personnel-table-wrap"><table className="personnel-table"><thead><tr>{fields.map((field)=><th key={field.key}>{field.label}{field.auto&&<small>自动</small>}</th>)}<th className="roster-action-cell">操作</th></tr></thead><tbody>{groupedEmployees.map((group)=><Fragment key={group.label}><tr className="roster-group-row"><td colSpan={fields.length+1}>{group.label} <b>{group.employees.length} 人</b></td></tr>{group.employees.map((employee)=><tr key={employee.id}>{fields.map((field)=><td key={field.key} title={value(employee,field)}>{value(employee,field)}</td>)}<td className="roster-action-cell"><button onClick={()=>openEditor(employee)}>编辑</button></td></tr>)}</Fragment>)}</tbody></table></div>{employees.length===0&&<div className="empty">{departedError||`${month.replace('-','年')}月暂无${tab}人员`}</div>}</section>
    {editing&&<div className="dept-modal-backdrop" onClick={()=>setEditing(null)}><section className="dept-modal roster-edit-modal" onClick={(event)=>event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">编辑人员名册</p><h2>{autoValue(editing,'name')}</h2></div><button onClick={()=>setEditing(null)}>×</button></div><div className="auto-fields-note">自动回写字段已锁定，其他字段修改后将保存到系统。</div><div className="roster-edit-grid">{fields.map((field)=><label key={field.key}><span>{field.label}{field.auto&&<em>自动</em>}</span><input type={field.label.includes('日期')||field.label.includes('时间')?'date':'text'} disabled={field.auto} value={field.auto?autoValue(editing,field.key):(draft[field.key]??'')} onChange={(event)=>setDraft((current)=>({...current,[field.key]:event.target.value}))}/></label>)}</div><div className="request-modal-actions"><button onClick={()=>setEditing(null)}>取消</button><button disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'保存修改'}</button></div></section></div>}
  </>;
}

function PlanningView({ section }: { section:string }) {
  const [data, setData] = useState<DingTalkData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [departedLoading, setDepartedLoading] = useState(false);
  const [departedError, setDepartedError] = useState('');
  const [departedLoaded, setDepartedLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<OrgChartNode|null>(null);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const chartTreeRef = useRef<HTMLDivElement>(null);
  const [chartScale, setChartScale] = useState(1);
  const [chartHeight, setChartHeight] = useState(620);
  const [chartNaturalSize, setChartNaturalSize] = useState({width:0,height:0});
  const [chartZoom, setChartZoom] = useState(1);
  const [staffingPlans,setStaffingPlans]=useState<StaffingItem[]>([]);
  const [staffingDepartment,setStaffingDepartment]=useState('全部');
  const [selectedStaffing,setSelectedStaffing]=useState<StaffingItem|null>(null);
  const [savingStaffing,setSavingStaffing]=useState('');

  async function loadStaffing() {
    const response=await fetch('/api/staffing',{cache:'no-store'});
    const result=await response.json();
    setStaffingPlans(result.results??[]);
  }

  async function saveApprovedHeadcount(departmentId:string,approvedHeadcount:number) {
    setSavingStaffing(departmentId);
    try {
      const response=await fetch('/api/staffing',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({departmentId,approvedHeadcount})});
      if(!response.ok)throw new Error('SAVE_FAILED');
      await loadStaffing();
    } finally { setSavingStaffing(''); }
  }

  async function load(force=false) {
    const cachedData = !force ? readDingTalkSession(DINGTALK_CURRENT_CACHE) : null;
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
    } else setLoading(true);
    setSyncing(true);
    setError('');
    try {
      const response = await fetch(`/api/dingtalk${force?'?refresh=1':''}`, { cache:'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '钉钉通讯录暂时不可用');
      let nextData=result as DingTalkData;
      let departedRefreshed=false;
      if(force) {
        try {
          const departedResponse=await fetch('/api/dingtalk?scope=departed&refresh=1',{cache:'no-store'});
          const departedResult=await departedResponse.json();
          if(!departedResponse.ok)throw new Error(departedResult.error||'离职状态同步失败');
          nextData={...result,employees:mergeEmployees(departedResult.employees,result.employees)};
          departedRefreshed=true;
          setDepartedLoaded(true);
          setDepartedError('');
          sessionStorage.setItem(DINGTALK_DEPARTED_CACHE,JSON.stringify({savedAt:Date.now(),data:departedResult}));
        } catch(syncError) {
          setDepartedError(syncError instanceof Error?syncError.message:'离职状态同步失败');
        }
      }
      setData((current)=>{
        const departed = departedRefreshed ? [] : current?.employees.filter((employee)=>employee.rosterStatus==='离职') ?? [];
        return {...nextData,employees:mergeEmployees(departed,nextData.employees)};
      });
      sessionStorage.setItem(DINGTALK_CURRENT_CACHE,JSON.stringify({savedAt:Date.now(),data:result}));
      if(force)await loadStaffing().catch(()=>setStaffingPlans([]));
    } catch (syncError) {
      if (!cachedData) {
        setData(null);
        setError(syncError instanceof Error ? syncError.message : '钉钉通讯录暂时不可用');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  async function loadDeparted() {
    if (departedLoaded || departedLoading) return;
    setDepartedError('');
    const cachedData = readDingTalkSession(DINGTALK_DEPARTED_CACHE);
    if (cachedData) {
      setData((current)=>current?{...current,employees:mergeEmployees(cachedData.employees,current.employees)}:current);
      setDepartedLoaded(true);
      return;
    }
    setDepartedLoading(true);
    try {
      const response = await fetch('/api/dingtalk?scope=departed',{cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error||'离职花名册暂时不可用');
      setData((current)=>current?{...current,employees:mergeEmployees(result.employees,current.employees)}:current);
      setDepartedLoaded(true);
      sessionStorage.setItem(DINGTALK_DEPARTED_CACHE,JSON.stringify({savedAt:Date.now(),data:result}));
    } catch (syncError) {
      setDepartedError(syncError instanceof Error?syncError.message:'离职花名册暂时不可用');
    } finally { setDepartedLoading(false); }
  }

  useEffect(() => { void load(false); }, []);
  useEffect(()=>{if(section==='人员名册'&&data&&!departedLoaded&&!departedLoading&&!departedError)void loadDeparted()},[section,data,departedLoaded,departedLoading,departedError]);
  useEffect(()=>{if(section==='编制管理'&&data)void loadStaffing().catch(()=>setStaffingPlans([]))},[section,data]);
  const visibleDepartments = useMemo(() => (data?.departments ?? []).filter((department)=>!isCompanyDepartment(department)), [data]);
  const chartNodes = useMemo(() => buildOrgChart(data?.departments ?? []), [data]);
  const departmentNames = useMemo(() => new Map(visibleDepartments.map((department)=>[department.id,department.name])), [visibleDepartments]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingDepartments = normalizedQuery ? visibleDepartments.filter((department)=>department.name.toLowerCase().includes(normalizedQuery)) : [];
  const currentEmployees = (data?.employees ?? []).filter((employee)=>employee.rosterStatus!=='离职');
  const positionCount = new Set(currentEmployees.map((employee)=>employee.title).filter(Boolean)).size;
  const hiddenCompanyCount = (data?.departments ?? []).length - visibleDepartments.length;
  const syncedTime = data ? new Date(data.syncedAt).toLocaleString('zh-CN',{hour12:false}) : '';
  const selectedEmployees = selectedDepartment&&data ? chartNodeEmployees(selectedDepartment,data.employees) : [];
  const selectedGroups = useMemo(()=>{
    if(!selectedDepartment||!data)return [] as Array<{id:string;name:string;employees:DingTalkEmployee[]}>;
    const allowed=descendantDepartmentIds(selectedDepartment);
    const byId=new Map(data.departments.map((department)=>[department.id,department]));
    const depth=(id:string)=>{let value=0;let current=byId.get(id);const seen=new Set<string>();while(current&&!seen.has(current.id)){seen.add(current.id);value+=1;current=byId.get(current.parentId)}return value};
    const groups=new Map<string,DingTalkEmployee[]>();
    selectedEmployees.forEach((employee)=>{
      const departmentId=employee.departmentIds.filter((id)=>allowed.has(id)&&byId.has(id)).sort((a,b)=>depth(b)-depth(a))[0]??selectedDepartment.id;
      groups.set(departmentId,[...(groups.get(departmentId)??[]),employee]);
    });
    return [...groups.entries()].map(([id,employees])=>({id,name:byId.get(id)?.name??selectedDepartment.name,employees:employees.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))})).sort((a,b)=>(byId.get(a.id)?.order??0)-(byId.get(b.id)?.order??0));
  },[selectedDepartment,data,selectedEmployees]);
  useLayoutEffect(()=>{
    if(section!=='组织架构'||!data)return;
    const viewport=chartViewportRef.current;
    const tree=chartTreeRef.current;
    if(!viewport||!tree)return;
    const fit=()=>{
      const naturalWidth=tree.scrollWidth;
      const naturalHeight=tree.scrollHeight;
      const availableWidth=Math.max(360,viewport.clientWidth-44);
      const scale=Math.min(1,availableWidth/naturalWidth);
      setChartNaturalSize({width:naturalWidth,height:naturalHeight});
      setChartScale(scale);
      setChartHeight(Math.max(620,Math.ceil(naturalHeight*scale)+110));
    };
    const frame=requestAnimationFrame(fit);
    const observer=new ResizeObserver(fit);
    observer.observe(viewport);
    return()=>{cancelAnimationFrame(frame);observer.disconnect()};
  },[section,data,chartNodes]);
  const effectiveChartScale=chartScale*chartZoom;
  const chartStageWidth=Math.ceil(chartNaturalSize.width*effectiveChartScale);
  const chartStageHeight=Math.ceil(chartNaturalSize.height*effectiveChartScale)+100;
  const chartViewportHeight=chartZoom===1?chartHeight:Math.min(820,Math.max(620,chartStageHeight));

  return <div className="planning-view">
    <div className="module-title planning-title"><div><p className="eyebrow">DINGTALK ORGANIZATION</p><div className="title-line"><h1>{section}</h1><span className="dingtalk-badge">钉钉实时数据</span></div><p>{section === '组织架构' ? '部门架构来自钉钉通讯录' : section==='人员名册' ? '人员入职后自动回写基础信息，其他资料由人事维护' : '根据钉钉部门和人员名册统计当前实际在岗人数'}</p></div><button className="sync-button" onClick={()=>void load(true)} disabled={syncing}>{syncing?'同步中…':'↻ 同步钉钉'}</button></div>
    {loading && !data && <section className="sync-state"><span className="sync-spinner"/><strong>正在快速读取组织数据</strong><p>优先加载在岗人员，离职花名册将在打开时按需读取。</p></section>}
    {!loading && error && !data && <section className="sync-state error-state"><span>!</span><strong>钉钉数据读取失败</strong><p>{error}</p><button onClick={()=>void load(true)}>重新同步</button></section>}
    {data && <>
      <section className="module-stats live-stats"><article><p>组织名称</p><strong className="org-name-value">{data.organizationName}</strong><span>钉钉</span></article><article><p>{section==='编制管理'?'编制部门':'展示部门'}</p><strong>{section==='编制管理'&&staffingPlans.length?staffingPlans.length:visibleDepartments.length}</strong><span>职能部门</span></article><article><p>当前人员</p><strong>{currentEmployees.length}</strong><span>在职与兼职</span></article><article><p>职位数量</p><strong>{positionCount}</strong><span>花名册</span></article></section>
      <div className="live-source-bar"><div><i/> 数据来源：{data.source}</div><span>同步时间：{syncedTime}</span></div>
      {section === '组织架构' ? <div className="visual-planning-grid">
        <section className="panel org-chart-panel classic-org-panel"><div className="panel-head org-chart-toolbar"><div><h2>组织架构图</h2><p>仅展示职能部门，已隐藏 {hiddenCompanyCount} 个公司主体节点；点击部门查看人员</p></div><div className="org-chart-actions"><div className="chart-zoom-controls" aria-label="组织架构图缩放"><button onClick={()=>setChartZoom((value)=>Math.max(.8,Number((value-.1).toFixed(1))))} disabled={chartZoom<=.8} aria-label="缩小组织架构图">−</button><button className="zoom-value" onClick={()=>setChartZoom(1)} title="恢复默认大小">{Math.round(chartZoom*100)}%</button><button onClick={()=>setChartZoom((value)=>Math.min(1.8,Number((value+.1).toFixed(1))))} disabled={chartZoom>=1.8} aria-label="放大组织架构图">＋</button></div><label className="table-search org-search">⌕ <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索部门或人员姓名"/></label></div></div>{normalizedQuery&&<div className="org-search-results">{matchingDepartments.map((department)=>{const node=(function find(nodes:OrgChartNode[]):OrgChartNode|null{for(const item of nodes){if(item.id===department.id)return item;const found=find(item.children);if(found)return found}return null})(chartNodes);return node&&<button key={department.id} onClick={()=>setSelectedDepartment(node)}><span>{department.name.slice(0,1)}</span><strong>{department.name}</strong><small>部门</small></button>})}{(data.employees??[]).filter((employee)=>employee.name.toLowerCase().includes(normalizedQuery)).slice(0,8).map((employee)=><button key={employee.id}><span>{employee.name.slice(0,1)}</span><strong>{employee.name}</strong><small>{employee.departmentIds.map((id)=>departmentNames.get(id)).filter(Boolean).join('、')||'总裁办'}</small></button>)}{matchingDepartments.length===0&&!data.employees.some((employee)=>employee.name.toLowerCase().includes(normalizedQuery))&&<p>没有找到匹配的部门或人员</p>}</div>}<div ref={chartViewportRef} className={`org-chart-scroll org-chart-fit classic-org-scroll ${chartZoom>1?'is-zoomed':''}`} style={{height:chartViewportHeight}}><div className="org-chart-stage" style={{width:chartStageWidth||'100%',height:Math.max(chartStageHeight,540)}}><div ref={chartTreeRef} className="org-chart-tree classic-org-tree" style={{transform:`translateX(-50%) scale(${effectiveChartScale})`}}><ul><li><button className="org-chart-node root-node"><span className="org-node-icon">{data.organizationName.slice(0,1)||'企'}</span><strong>{data.organizationName}</strong><small>{currentEmployees.length} 人 · 钉钉组织</small></button><OrgChartBranch nodes={chartNodes} employees={data.employees} onSelect={setSelectedDepartment}/></li></ul></div></div></div></section>
      </div> : section==='人员名册' ? <PersonnelRosterView data={data} departedLoaded={departedLoaded} departedLoading={departedLoading} departedError={departedError} onLoadDeparted={loadDeparted}/> : <section className="panel headcount-panel"><div className="panel-head"><div><h2>部门编制管理</h2><p>核定编制可手动选择；招聘需求实时读取核定编制与在岗编制</p></div></div><div className="department-filter-bar staffing-filter-bar"><strong>选择部门：</strong><button className={staffingDepartment==='全部'?'active':''} onClick={()=>setStaffingDepartment('全部')}>全部</button>{staffingPlans.map((plan)=><button className={staffingDepartment===plan.departmentId?'active':''} onClick={()=>setStaffingDepartment(plan.departmentId)} key={plan.departmentId}>{plan.departmentName}</button>)}</div><div className="headcount-table"><div className="staffing-row staffing-head"><span>部门</span><span>核定编制</span><span>在岗编制</span><span>数据状态</span></div>{staffingPlans.filter((plan)=>staffingDepartment==='全部'||plan.departmentId===staffingDepartment).map((plan)=><div className="staffing-row" key={plan.departmentId}><span><strong>{plan.departmentName}</strong></span><span><select className="headcount-select" aria-label={`${plan.departmentName}核定编制`} value={plan.approvedHeadcount} disabled={savingStaffing===plan.departmentId} onChange={(event)=>void saveApprovedHeadcount(plan.departmentId,Number(event.target.value))}>{Array.from({length:301},(_,value)=><option value={value} key={value}>{value} 人</option>)}</select></span><span><button className="staffing-people-button" onClick={()=>setSelectedStaffing(plan)}>{plan.currentHeadcount} 人 <em>查看人员</em></button></span><span className={plan.remainingHeadcount<=0?'staffing-warning':''}><i/>{plan.status} · 余额 {plan.remainingHeadcount}</span></div>)}</div></section>}
    </>}
    {selectedDepartment&&<div className="dept-modal-backdrop" onClick={()=>setSelectedDepartment(null)}><section className="dept-modal" onClick={(event)=>event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">部门人员</p><h2>{selectedDepartment.name}</h2></div><button onClick={()=>setSelectedDepartment(null)}>×</button></div><div className="dept-summary"><span>{selectedDepartment.name.slice(0,1)}</span><div><strong>负责人：{selectedDepartment.managerNames.join('、')||'未设置'}</strong><p>当前人员 {selectedEmployees.length} 人（按所属部门分类）</p></div></div><div className="dept-people-list grouped-people-list">{selectedGroups.map((group)=><section className="dept-person-group" key={group.id}><h3>{group.name}<span>{group.employees.length} 人</span></h3><div className="dept-people-head"><span>姓名 / 部门</span><span>岗位</span><span>入职时间</span></div>{group.employees.map((employee)=><article key={employee.id}><i>{employee.name.slice(0,1)}</i><div><strong>{employee.name}</strong><p>{group.name}</p></div><span>{employee.title||'岗位未填写'}</span><time>{employee.hireDate||'未维护'}</time></article>)}</section>)}{selectedEmployees.length===0&&<div className="empty">该部门暂无在岗人员</div>}</div></section></div>}
    {selectedStaffing&&<div className="dept-modal-backdrop" onClick={()=>setSelectedStaffing(null)}><section className="dept-modal staffing-people-modal" onClick={(event)=>event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">在岗人员基础信息</p><h2>{selectedStaffing.departmentName}</h2></div><button onClick={()=>setSelectedStaffing(null)}>×</button></div><div className="staffing-people-summary">当前在岗 <strong>{selectedStaffing.currentHeadcount}</strong> 人</div><div className="staffing-people-table"><div className="staffing-person-row staffing-person-head"><span>部门</span><span>姓名</span><span>入职时间</span></div>{selectedStaffing.employees.map((employee)=><div className="staffing-person-row" key={employee.id}><span>{employee.department}</span><span><strong>{employee.name}</strong></span><span>{employee.hireDate||'未维护'}</span></div>)}{selectedStaffing.employees.length===0&&<div className="empty">该部门暂无在岗人员</div>}</div></section></div>}
  </div>;
}

export default function Home({initialActive=0,initialRecruitingSection='招聘需求'}:{initialActive?:number;initialRecruitingSection?:string}={}) {
  const [active, setActive] = useState(initialActive);
  const [planningSection, setPlanningSection] = useState('组织架构');
  const [recruitingSection, setRecruitingSection] = useState(initialRecruitingSection);
  const [completed, setCompleted] = useState<string[]>([]);
  const [showFlow, setShowFlow] = useState(false);
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">HR</span><span>人资管理系统</span></div>
        <nav aria-label="主导航">
          {navGroups.map((group)=><div className="nav-group" key={group.label}>{group.items.map(([index,item,icon]) => (
            <div className="nav-entry" key={item}><button onClick={()=>setActive(index)} className={`nav-item ${index === active ? 'active' : ''}`}>
              <span className="nav-icon">{icon}</span>{item}
              {(index === 1||index === 2) && <span className="nav-arrow">⌄</span>}
            </button>{index === 1 && active === 1 && <div className="sub-nav">{['组织架构','人员名册','编制管理'].map(name=><button className={planningSection===name?'active':''} onClick={()=>setPlanningSection(name)} key={name}><i/>{name}</button>)}</div>}{index === 2 && active === 2 && <div className="sub-nav recruiting-sub-nav">{Object.keys(recruitingContent).map(name=><button className={recruitingSection===name?'active':''} onClick={()=>setRecruitingSection(name)} key={name}><i/>{name}</button>)}</div>}</div>
          ))}</div>)}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="top-left"><button className="org-switcher"><span>企</span> 钉钉组织 <b>⌄</b></button><label className="search"><span>⌕</span><input aria-label="搜索" placeholder="全局搜索员工、岗位、流程或报表" /><kbd>⌘ K</kbd></label></div>
          <div className="top-actions"><button aria-label="应用中心">⊞</button><button aria-label="消息">◎<i /></button><button aria-label="通知">♧</button><div className="avatar">周</div><div className="profile"><strong>周书言</strong><span>集团 HR 管理员</span></div><button className="logout-button" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'}); window.location.replace('/login');}}>退出</button></div>
        </header>

        <div className="content">
          {active === 7 ? <ReportView /> : active === 1 ? <PlanningView section={planningSection}/> : active === 2 ? recruitingSection==='招聘需求'?<RecruitmentDashboardView/>:<RecruitingView section={recruitingSection}/> : active !== 0 ? <ModuleView index={active} /> : <>
          <div className="dashboard-toolbar"><div className="role-switch"><button className="active">HR 工作台</button><button>管理者工作台</button><button>员工工作台</button></div><div className="sync-status"><i/> 全平台数据已同步 <span>刚刚</span></div></div>
          <div className="welcome-row">
            <div><p className="eyebrow">2026 年 8 月 27 日 · 星期四</p><h1>早上好，周书言 <span>👋</span></h1><p>这里是今日需要关注的人力资源动态。</p></div>
            <button className="primary-btn" onClick={()=>setShowFlow(true)}><span>＋</span> 发起人事流程</button>
          </div>

          <section className="stats-grid" aria-label="核心人力指标">
            <article className="stat-card"><div className="stat-head"><span className="icon-box blue">人</span><em className="up">↗ 2.4%</em></div><p>在职员工</p><strong>328</strong><span className="note">较上月增加 8 人</span></article>
            <article className="stat-card"><div className="stat-head"><span className="icon-box violet">招</span><em className="up">↗ 12%</em></div><p>开放职位</p><strong>24</strong><span className="note">本月已入职 11 人</span></article>
            <article className="stat-card"><div className="stat-head"><span className="icon-box amber">绩</span><em className="steady">进行中</em></div><p>绩效完成率</p><strong>86<span className="unit">%</span></strong><span className="note">还剩 3 天截止</span></article>
            <article className="stat-card"><div className="stat-head"><span className="icon-box green">训</span><em className="up">↗ 5.8%</em></div><p>人均学习时长</p><strong>7.6<span className="unit">h</span></strong><span className="note">本月累计</span></article>
          </section>

          <div className="main-grid">
            <section className="panel tasks-panel">
              <div className="panel-head"><div><h2>待办事项 <b>12</b></h2><p>按紧急程度为你排序</p></div><button>查看全部 →</button></div>
              <div className="task-list">
                {tasks.map((task) => <article className={`task ${completed.includes(task.title)?'done':''}`} key={task.title}><span className={`task-type ${task.tone}`}>{task.type}</span><div><strong>{task.title}</strong><p>{task.meta}</p></div><button onClick={()=>setCompleted([...completed,task.title])} aria-label={`处理${task.title}`}>{completed.includes(task.title)?'已完成':'处理'}</button></article>)}
              </div>
            </section>

            <section className="panel trend-panel">
              <div className="panel-head"><div><h2>组织健康度</h2><p>近 6 个月趋势</p></div><select aria-label="选择部门"><option>全公司</option><option>产品中心</option></select></div>
              <div className="health-score"><strong>82</strong><span>良好</span><p>综合人效、稳定性与活力</p></div>
              <div className="chart" aria-label="组织健康度趋势图">
                {[62,70,66,78,74,88].map((height, i) => <div key={i} className="bar-wrap"><div className="bar" style={{height: `${height}%`}} /><span>{['3月','4月','5月','6月','7月','8月'][i]}</span></div>)}
              </div>
            </section>
          </div>

          <section className="panel quick-panel">
            <div className="panel-head"><div><h2>快捷入口</h2><p>常用人事服务一步直达</p></div></div>
            <div className="quick-grid">
              {[['＋','新增员工','建立员工档案'],['招','发布职位','开启招聘流程'],['绩','绩效校准','进入校准会议'],['薪','薪酬核算','核算本月薪资'],['导','数据报表','查看人力分析']].map(([icon,title,desc], i) => <button className="quick-card" onClick={()=>i===0?setShowFlow(true):setActive([6,2,4,5,1][i])} key={title}><span className={`quick-icon q${i}`}>{icon}</span><div><strong>{title}</strong><p>{desc}</p></div><b>›</b></button>)}
            </div>
          </section></>}
        </div>
      </section>
      {showFlow&&<div className="modal-backdrop" onClick={()=>setShowFlow(false)}><section className="flow-modal" onClick={(e)=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">统一流程中心</p><h2>发起人事流程</h2></div><button onClick={()=>setShowFlow(false)}>×</button></div><p className="modal-note">选择流程后，员工档案与相关模块会自动同步更新。</p><div className="flow-options">{[['入','员工入职','自动生成档案与合同'],['调','转岗调动','同步组织、薪酬与权限'],['薪','薪酬调整','联动绩效与工资核算'],['离','员工离职','触发交接与停薪流程']].map(([icon,title,desc])=><button key={title}><span>{icon}</span><div><strong>{title}</strong><p>{desc}</p></div><b>›</b></button>)}</div></section></div>}
    </main>
  );
}
