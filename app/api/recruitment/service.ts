import { env } from 'cloudflare:workers';
import { recruitmentSchemaStatements } from '../../../db/schema';

export const demandTypes = ['新增编制','离职补缺','优化替换','其他'] as const;
type DemandType = typeof demandTypes[number];
type CachedDepartment = { id:string; name:string };
type CachedEmployee = { id:string; name:string; nickname?:string; title:string; departmentIds:string[]; rosterStatus:string; hireDate?:string };
type CurrentCache = { departments?:CachedDepartment[]; employees?:CachedEmployee[] };
type RequestRow = { id:string;department_id:string;department_name:string;position_name:string;demand_type:DemandType;status:string;headcount_needed:number;created_at:string;updated_at:string };
type CanonicalDepartment = { id:string;name:string;sourceIds:string[] };
type RequestMapping = [fromId:string,toId:string,toName:string];

function jsonValue<T>(value:string|undefined,fallback:T):T {
  try { return value?JSON.parse(value) as T:fallback; } catch { return fallback; }
}

export const canonicalDepartments = jsonValue<CanonicalDepartment[]>(process.env.HR_CANONICAL_DEPARTMENTS,[]);
const legacyPlanSources = new Map(Object.entries(jsonValue<Record<string,string>>(process.env.HR_LEGACY_PLAN_SOURCES,{})));
const requestMappings = jsonValue<RequestMapping[]>(process.env.HR_RECRUITMENT_REQUEST_MAPPINGS,[]);

function database() {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db) throw new Error('RECRUITMENT_DATABASE_UNAVAILABLE');
  return db;
}

async function currentOrganization(db:D1Database) {
  const row=await db.prepare("SELECT payload FROM data_cache WHERE cache_key = 'current'").first<{payload:string}>();
  if(!row) throw new Error('DINGTALK_CACHE_UNAVAILABLE');
  return JSON.parse(row.payload) as CurrentCache;
}

function canonicalSourceIds(data:CurrentCache,department:CanonicalDepartment) {
  return [...department.sourceIds];
}

function canonicalEmployees(data:CurrentCache,department:typeof canonicalDepartments[number]) {
  const sourceIds=canonicalSourceIds(data,department);
  return (data.employees??[]).filter((employee)=>employee.rosterStatus!=='离职'&&sourceIds.some((id)=>employee.departmentIds.includes(id)));
}

function canonicalCounts(data:CurrentCache) {
  return new Map(canonicalDepartments.map((department)=>[department.id,canonicalEmployees(data,department).length]));
}

async function synchronizeCanonicalDepartments(db:D1Database,organization:CurrentCache,counts:Map<string,number>) {
  const existingPlans=(await db.prepare('SELECT department_id, approved_headcount FROM staffing_plans').all<{department_id:string;approved_headcount:number}>()).results;
  const planMap=new Map(existingPlans.map((plan)=>[plan.department_id,plan.approved_headcount]));
  const now=new Date().toISOString();
  const statements:D1PreparedStatement[]=[];
  for(const department of canonicalDepartments) {
    const approved=planMap.get(department.id)??planMap.get(legacyPlanSources.get(department.id)??'')??Math.max(0,(counts.get(department.id)??0)+2);
    statements.push(db.prepare('INSERT INTO staffing_plans (department_id, department_name, approved_headcount, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(department_id) DO UPDATE SET department_name = excluded.department_name').bind(department.id,department.name,approved,now));
  }
  for(const [fromId,toId,toName] of requestMappings) statements.push(db.prepare('UPDATE recruitment_requests SET department_id = ?, department_name = ?, updated_at = ? WHERE department_id = ?').bind(toId,toName,now,fromId));
  await db.batch(statements);
  const placeholders=canonicalDepartments.map(()=>'?').join(',');
  await db.prepare(`DELETE FROM staffing_plans WHERE department_id NOT IN (${placeholders})`).bind(...canonicalDepartments.map((department)=>department.id)).run();
}

export async function ensureRecruitmentData() {
  const db=database();
  if(!canonicalDepartments.length)throw new Error('CANONICAL_DEPARTMENTS_NOT_CONFIGURED');
  await db.batch(recruitmentSchemaStatements.map((sql)=>db.prepare(sql)));
  const organization=await currentOrganization(db);
  const counts=canonicalCounts(organization);
  const existing=await db.prepare('SELECT COUNT(*) AS total FROM recruitment_requests').first<{total:number}>();
  if((existing?.total??0)===0) {
    const candidates=canonicalDepartments.filter((department)=>canonicalEmployees(organization,department).some((employee)=>employee.title)).slice(0,8);
    if(candidates.length===0) throw new Error('RECRUITMENT_SEED_SOURCE_UNAVAILABLE');
    const now=new Date();const types:DemandType[]=['新增编制','离职补缺','优化替换','其他'];const statuses=['RECRUITING','PENDING_APPROVAL','RECRUITING','URGENT','RECRUITING','CLOSED','RECRUITING','URGENT'];const balanceOffsets=[2,0,-1,3,1,0,2,-2];const ages=[2,4,12,9,15,21,5,11];const statements:D1PreparedStatement[]=[];
    candidates.forEach((department,index)=>{const employees=canonicalEmployees(organization,department).filter((employee)=>employee.title);const positionName=employees[index%employees.length].title;const currentCount=counts.get(department.id)??0;const approved=Math.max(0,currentCount+balanceOffsets[index%balanceOffsets.length]);const createdAt=new Date(now.getTime()-ages[index%ages.length]*86400000).toISOString();const requestId=`req-${department.id}-${index+1}`;statements.push(db.prepare('INSERT INTO staffing_plans (department_id, department_name, approved_headcount, updated_at) VALUES (?, ?, ?, ?)').bind(department.id,department.name,approved,now.toISOString()));statements.push(db.prepare('INSERT INTO recruitment_requests (id, department_id, department_name, position_name, demand_type, status, headcount_needed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(requestId,department.id,department.name,positionName,types[index%types.length],statuses[index%statuses.length],index%3===0?2:1,createdAt,now.toISOString()));if(statuses[index%statuses.length]==='PENDING_APPROVAL')statements.push(db.prepare('INSERT INTO recruitment_approvals (id, request_id, status, created_at) VALUES (?, ?, ?, ?)').bind(`approval-${requestId}`,requestId,'PENDING',createdAt))});
    const activeCount=statuses.slice(0,candidates.length).filter((status)=>status==='RECRUITING'||status==='URGENT').length;const previousMonth=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,7);statements.push(db.prepare('INSERT INTO recruitment_monthly_snapshots (month, open_positions, created_at) VALUES (?, ?, ?)').bind(previousMonth,Math.max(0,activeCount-2),now.toISOString()));await db.batch(statements);
  }
  await synchronizeCanonicalDepartments(db,organization,counts);
  return db;
}

export async function recruitmentDashboard(params:URLSearchParams) {
  const db=await ensureRecruitmentData();
  const organization=await currentOrganization(db);
  const counts=canonicalCounts(organization);
  const plans=(await db.prepare('SELECT department_id, department_name, approved_headcount FROM staffing_plans').all<{department_id:string;department_name:string;approved_headcount:number}>()).results;
  const planMap=new Map(plans.map((plan)=>[plan.department_id,plan]));
  const allRequests=(await db.prepare('SELECT * FROM recruitment_requests').all<RequestRow>()).results;
  const pendingApprovals=(await db.prepare("SELECT COUNT(*) AS total FROM recruitment_approvals WHERE status = 'PENDING'").first<{total:number}>())?.total??0;
  const joined=allRequests.map((request)=>{
    const currentHeadcount=counts.get(request.department_id)??0;
    const approvedHeadcount=planMap.get(request.department_id)?.approved_headcount??currentHeadcount;
    const remainingHeadcount=approvedHeadcount-currentHeadcount;
    const capacityLabel=remainingHeadcount<0?'超编':remainingHeadcount===0?'满编':'';
    const statusLabel=request.status==='CLOSED'?'已关闭':remainingHeadcount<=0?'超编预警':request.status==='URGENT'?'紧急补岗':'正常招聘';
    return {id:request.id,departmentId:request.department_id,departmentName:request.department_name,positionName:request.position_name,demandType:request.demand_type,currentHeadcount,approvedHeadcount,remainingHeadcount,capacityLabel,status:request.status,statusLabel,headcountNeeded:request.headcount_needed,createdAt:request.created_at};
  });

  const open=joined.filter((item)=>item.status==='RECRUITING'||item.status==='URGENT');
  const warningDepartments=plans.map((plan)=>({departmentId:plan.department_id,departmentName:plan.department_name,remainingHeadcount:plan.approved_headcount-(counts.get(plan.department_id)??0)})).filter((item)=>item.remainingHeadcount<=0);
  const stale=open.filter((item)=>Date.now()-new Date(item.createdAt).getTime()>7*86400000);
  const previousMonth=new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString().slice(0,7);
  const previousOpen=(await db.prepare('SELECT open_positions FROM recruitment_monthly_snapshots WHERE month = ?').bind(previousMonth).first<{open_positions:number}>())?.open_positions??open.length;
  const todos=[
    ...(pendingApprovals?[{id:'todo-approvals',type:'approval',title:`${pendingApprovals} 个招聘需求待审批`,description:'来自招聘审批流程表，建议今日完成处理',count:pendingApprovals}]:[]),
    ...warningDepartments.filter((item)=>item.remainingHeadcount<0).map((item)=>({id:`todo-capacity-${item.departmentId}`,type:'capacity',title:`${item.departmentName} 已超编`,description:`当前编制余额 ${item.remainingHeadcount}，请复核编制或招聘需求`,count:1})),
    ...stale.map((item)=>({id:`todo-stale-${item.id}`,type:'stale',title:`${item.positionName} 超 7 天未关闭`,description:`${item.departmentName} · 创建于 ${item.createdAt.slice(0,10)}`,count:1,requestId:item.id}))
  ];

  const demandType=params.get('demand_type');
  const status=params.get('status');
  const departmentId=params.get('department_id');
  let filtered=joined.filter((item)=>(!demandType||demandType==='全部'||item.demandType===demandType)&&(!status||item.status===status)&&(!departmentId||departmentId==='全部'||item.departmentId===departmentId));
  const ordering=params.get('ordering')??'-created_at';
  const descending=ordering.startsWith('-');
  const key=ordering.replace(/^-/,'');
  const value=(item:typeof joined[number])=>key==='department_name'?item.departmentName:key==='position_name'?item.positionName:key==='remaining_headcount'?item.remainingHeadcount:key==='status'?item.statusLabel:new Date(item.createdAt).getTime();
  filtered=[...filtered].sort((a,b)=>{const left=value(a);const right=value(b);const result=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right),'zh-CN');return descending?-result:result});
  const page=Math.max(1,Number(params.get('page')??1)||1);
  const pageSize=Math.min(50,Math.max(5,Number(params.get('page_size')??10)||10));
  const start=(page-1)*pageSize;
  const positionOptions=[...new Set((organization.employees??[]).map((employee)=>employee.title).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  return {
    summary:{openPositions:open.length,openPositionsMoM:open.length-previousOpen,pendingApprovals,capacityWarnings:warningDepartments.length,pendingTodos:todos.reduce((sum,item)=>sum+item.count,0),stalePositions:stale.length},
    todos,warningDepartments,demandTypes,positionOptions,departments:canonicalDepartments.map(({id,name})=>({id,name})),
    count:filtered.length,page,pageSize,next:start+pageSize<filtered.length?page+1:null,previous:page>1?page-1:null,results:filtered.slice(start,start+pageSize)
  };
}

export async function updateRecruitmentRequest(input:{id?:string;action?:string;demandType?:string}) {
  const db=await ensureRecruitmentData();
  if(!input.id) throw new Error('INVALID_REQUEST_ID');
  if(input.action==='close') await db.prepare("UPDATE recruitment_requests SET status = 'CLOSED', updated_at = ? WHERE id = ?").bind(new Date().toISOString(),input.id).run();
  else if(input.demandType&&demandTypes.includes(input.demandType as DemandType)) await db.prepare('UPDATE recruitment_requests SET demand_type = ?, updated_at = ? WHERE id = ?').bind(input.demandType,new Date().toISOString(),input.id).run();
  else throw new Error('INVALID_RECRUITMENT_UPDATE');
  return {ok:true};
}

export async function staffingOverview() {
  const db=await ensureRecruitmentData();
  const organization=await currentOrganization(db);
  const counts=canonicalCounts(organization);
  const plans=(await db.prepare('SELECT department_id, department_name, approved_headcount, updated_at FROM staffing_plans').all<{department_id:string;department_name:string;approved_headcount:number;updated_at:string}>()).results;
  const planMap=new Map(plans.map((plan)=>[plan.department_id,plan]));
  const departmentNames=new Map((organization.departments??[]).map((department)=>[department.id,department.name]));
  return {results:canonicalDepartments.map((department)=>{const plan=planMap.get(department.id);const employees=canonicalEmployees(organization,department);const currentHeadcount=counts.get(department.id)??0;const approvedHeadcount=plan?.approved_headcount??currentHeadcount;const remainingHeadcount=approvedHeadcount-currentHeadcount;const sourceIds=new Set(canonicalSourceIds(organization,department));return {departmentId:department.id,departmentName:department.name,approvedHeadcount,currentHeadcount,remainingHeadcount,status:remainingHeadcount<0?'超编':remainingHeadcount===0?'满编':'正常',updatedAt:plan?.updated_at??'',employees:employees.map((employee)=>({id:employee.id,name:employee.name,department:employee.departmentIds.filter((id)=>sourceIds.has(id)).map((id)=>departmentNames.get(id)).filter(Boolean).join('、')||department.name,hireDate:employee.hireDate??''})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))}})};
}

export async function updateStaffingPlan(input:{departmentId?:string;approvedHeadcount?:number}) {
  const department=canonicalDepartments.find((item)=>item.id===input.departmentId);
  const approvedHeadcount=Number(input.approvedHeadcount);
  if(!department||!Number.isInteger(approvedHeadcount)||approvedHeadcount<0||approvedHeadcount>300) throw new Error('INVALID_STAFFING_PLAN');
  const db=await ensureRecruitmentData();
  const now=new Date().toISOString();
  await db.prepare('INSERT INTO staffing_plans (department_id, department_name, approved_headcount, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(department_id) DO UPDATE SET approved_headcount = excluded.approved_headcount, department_name = excluded.department_name, updated_at = excluded.updated_at').bind(department.id,department.name,approvedHeadcount,now).run();
  return {ok:true};
}
