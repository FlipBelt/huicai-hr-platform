import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';
import { createDataCacheTable } from '../../../db/schema';

export const dynamic = 'force-dynamic';

type RawDepartment = { dept_id?: number; name?: string; parent_id?: number; order?: number; dept_manager_userid_list?: string[] | string };
type HrmFieldValue = { label?: string; value?: string };
type HrmField = { field_code?: string; field_value_list?: HrmFieldValue[] };
type HrmRecord = { userid?: string; field_data_list?: HrmField[] };
type DimissionInfo = { userid?:string; last_work_day?:number; reason_memo?:string; reason_type?:number; main_dept_name?:string; dept_list?:Array<{dept_path?:string;dept_id?:number}> };
type CachedPayload = { expiresAt:number; data:Record<string, unknown> };
type NormalizedDepartment = { id:string; name:string; parentId:string; order:number; managerIds:string[]; managerNames:string[] };
type NormalizedEmployee = { id:string; name:string; nickname:string; title:string; departmentIds:string[]; employeeType:string; employeeStatus:string; rosterStatus:string; hireDate:string; regularDate:string; certificateNoMasked:string; departureDate?:string };

const HRM_FIELDS = ['sys00-name','sys00-deptIds','sys00-position','sys00-confirmJoinTime','sys01-employeeType','sys01-employeeStatus','sys01-regularTime','sys01-planRegularTime','sys02-certNo'];
const CACHE_TTL = 10 * 60 * 1000;
const responseCache = new Map<string, CachedPayload>();

function commaSeparatedSet(value?:string) {
  return new Set((value??'').split(',').map((item)=>item.trim()).filter(Boolean));
}

function stringRecord(value?:string):Record<string,string> {
  try { return value?JSON.parse(value):{}; } catch { return {}; }
}

function membershipExclusions(value?:string) {
  try {
    const parsed=value?JSON.parse(value) as Record<string,string[]>:{};
    return new Map(Object.entries(parsed).map(([employeeId,departmentIds])=>[employeeId,new Set(departmentIds)]));
  } catch { return new Map<string,Set<string>>(); }
}

const EXCLUDED_EMPLOYEE_IDS = commaSeparatedSet(process.env.DINGTALK_EXCLUDED_EMPLOYEE_IDS);
const EXCLUDED_EMPLOYEE_NAMES = commaSeparatedSet(process.env.DINGTALK_EXCLUDED_EMPLOYEE_NAMES);
const MANAGER_OVERRIDES = stringRecord(process.env.DINGTALK_MANAGER_OVERRIDES);
const DEPARTMENT_NAME_OVERRIDES = stringRecord(process.env.DINGTALK_DEPARTMENT_NAME_OVERRIDES);
const MEMBERSHIP_EXCLUSIONS = membershipExclusions(process.env.DINGTALK_MEMBERSHIP_EXCLUSIONS);

function database() { return (env as unknown as { DB?:D1Database }).DB ?? null; }

async function readPersistentCache(key:string) {
  const db = database();
  if (!db) return null;
  try {
    await db.prepare(createDataCacheTable).run();
    const row = await db.prepare('SELECT payload, updated_at FROM data_cache WHERE cache_key = ?').bind(key).first<{payload:string;updated_at:number}>();
    if (!row || Date.now() - row.updated_at >= CACHE_TTL) return null;
    return JSON.parse(row.payload) as Record<string,unknown>;
  } catch { return null; }
}

async function writePersistentCache(key:string,data:Record<string,unknown>) {
  const db = database();
  if (!db) return;
  try {
    await db.prepare(createDataCacheTable).run();
    await db.prepare('INSERT INTO data_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').bind(key,JSON.stringify(data),Date.now()).run();
  } catch { /* Runtime memory and browser session caches remain available. */ }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

async function legacyCall<T>(token: string, endpoint: string, body: Record<string, unknown>) {
  const result = await requestJson<{ errcode?: number; result?: T }>(
    `https://oapi.dingtalk.com/${endpoint}?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (result.errcode !== 0 || !result.result) throw new Error(`DINGTALK_${endpoint.replaceAll('/', '_')}`);
  return result.result;
}

function managerIds(value: RawDepartment['dept_manager_userid_list']) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function values(record: HrmRecord, code: string) {
  const field = record.field_data_list?.find((item) => item.field_code === code);
  return (field?.field_value_list ?? []).map((item) => item.label || item.value || '').filter(Boolean);
}

function firstValue(record: HrmRecord, code: string) { return values(record, code)[0] ?? ''; }

function dateValue(value: string) {
  if (!value) return '';
  if (/^\d{10,13}$/.test(value)) {
    const number = Number(value);
    // DingTalk HR timestamps represent China-local calendar dates. Shift to
    // UTC+8 before taking the ISO date so midnight does not appear a day early.
    const date = new Date((value.length === 10 ? number * 1000 : number) + 8 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return value.replaceAll('/', '-').slice(0, 10);
}

function maskedCertificate(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  return `${normalized.slice(0, 4)}${'*'.repeat(Math.min(10, normalized.length - 8))}${normalized.slice(-4)}`;
}

function splitPersonName(value:string) {
  const parts=value.split(/[-—–]/).map((item)=>item.trim()).filter(Boolean);
  return parts.length>=2?{nickname:parts[0],realName:parts.slice(1).join('-')}:{nickname:'',realName:value.trim()};
}

function normalizePersonName(value:string) { return splitPersonName(value).realName.replace(/\s+/g,'').toLowerCase(); }

function employeePlacement(employee:NormalizedEmployee,departments:NormalizedDepartment[]) {
  const byId=new Map(departments.map((department)=>[department.id,department]));
  const depth=(id:string)=>{let count=0;let current=byId.get(id);const seen=new Set<string>();while(current&&!seen.has(current.id)){seen.add(current.id);count+=1;current=byId.get(current.parentId)}return count};
  const leafId=employee.departmentIds.filter((id)=>byId.has(id)).sort((a,b)=>depth(b)-depth(a))[0];
  const chain:NormalizedDepartment[]=[];let current=leafId?byId.get(leafId):undefined;const seen=new Set<string>();
  while(current&&!seen.has(current.id)){seen.add(current.id);chain.unshift(current);current=byId.get(current.parentId)}
  const compact=chain.slice(-3);
  if(compact.length>=2)return {center:compact[0].name,department:compact[1].name};
  return {center:'',department:compact[0]?.name??''};
}

async function syncRosterProfiles(scope:'current'|'departed',employees:NormalizedEmployee[],departments:NormalizedDepartment[]) {
  const db=database();
  if(!db)return employees;
  try {
    const rows=(await db.prepare('SELECT employee_id, profile_json FROM employee_roster_profiles').all<{employee_id:string;profile_json:string}>()).results;
    const profiles=new Map(rows.map((row)=>{try{return[row.employee_id,JSON.parse(row.profile_json) as Record<string,string>]}catch{return[row.employee_id,{}]}}));
    const profileIdByName=new Map([...profiles.entries()].filter(([,profile])=>profile.sourceName).map(([id,profile])=>[normalizePersonName(profile.sourceName),id]));
    const eligible=scope==='departed'?employees.flatMap((employee)=>{
      const profileId=profiles.has(employee.id)?employee.id:profileIdByName.get(normalizePersonName(employee.name));
      return profileId?[{...employee,id:profileId}]:[];
    }):employees;
    const now=new Date().toISOString();
    const writes=eligible.map((employee)=>{
      const current=profiles.get(employee.id)??{};
      const placement=employeePlacement(employee,departments);
      const hasDetailedPlacement=Boolean(placement.center&&placement.department);
      const identity=splitPersonName(employee.name);
      const organizationOverride=current.organizationOverride==='1';
      const titleOverride=current.titleOverride==='1';
      const merged={
        ...current,
        sourceName:current.sourceName||identity.realName,
        sourceStatus:scope==='departed'?'离职':employee.rosterStatus,
        sourceCenter:organizationOverride?(current.sourceCenter??placement.center):(hasDetailedPlacement?placement.center:(current.sourceCenter||placement.center)),
        sourceDepartment:organizationOverride?(current.sourceDepartment??placement.department):(hasDetailedPlacement?placement.department:(current.sourceDepartment||placement.department)),
        sourceTitle:titleOverride?(current.sourceTitle||employee.title):(employee.title||current.sourceTitle||''),
        sourceHireDate:employee.hireDate||current.sourceHireDate||'',
        nickname:current.nickname||identity.nickname,
        departureDate:scope==='departed'?(employee.departureDate||current.departureDate||''):(current.departureDate||''),
      };
      return db.prepare("INSERT INTO employee_roster_profiles (employee_id, profile_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at").bind(employee.id,JSON.stringify(merged),now);
    });
    if(writes.length)await db.batch(writes);
    return eligible;
  } catch { return employees; }
}

async function employeeIds(token: string, endpoint: string, statusList?: string) {
  const ids: string[] = [];
  let cursor = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await legacyCall<{ data_list?: string[]; next_cursor?: number }>(token, endpoint, { ...(statusList ? { status_list: statusList } : {}), offset: cursor, size: 50 });
    ids.push(...(result.data_list ?? []).filter(Boolean));
    if (!result.data_list?.length || typeof result.next_cursor !== 'number' || result.next_cursor === cursor) break;
    cursor = result.next_cursor;
  }
  return [...new Set(ids)];
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session || !(await verifySessionToken(session))) return NextResponse.json({ error: '登录已失效，请重新登录' }, { status: 401 });

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'departed' ? 'departed' : 'current';
  const refresh = url.searchParams.get('refresh') === '1';
  if (!refresh) {
    const persistentCached = await readPersistentCache(scope);
    if (persistentCached) return NextResponse.json(persistentCached, { headers: { 'cache-control': 'private, max-age=60', 'x-data-cache': 'persistent-hit' } });
  }
  const cached = responseCache.get(scope);
  if (!refresh && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, { headers: { 'cache-control': 'private, max-age=60', 'x-data-cache': 'hit' } });
  }

  try {
    const appKey = process.env.DINGTALK_CLIENT_ID;
    const appSecret = process.env.DINGTALK_CLIENT_SECRET;
    const agentId = Number(process.env.DINGTALK_AGENT_ID);
    if (!appKey || !appSecret || !Number.isFinite(agentId)) throw new Error('DINGTALK_NOT_CONFIGURED');

    const tokenResult = await requestJson<{ accessToken?: string }>('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appKey, appSecret }),
    });
    if (!tokenResult.accessToken) throw new Error('DINGTALK_TOKEN_FAILED');
    const token = tokenResult.accessToken;

    let organizationName = scope === 'departed' ? '' : '钉钉组织';
    const departmentDetails = new Map<number, RawDepartment>();
    if (scope === 'current') try {
      const root = await legacyCall<RawDepartment>(token, 'topapi/v2/department/get', { dept_id: 1, language: 'zh_CN' });
      if (root.name) organizationName = root.name;
      departmentDetails.set(1, root);
    } catch { /* Root name is optional. */ }

    const departments = new Map<number, RawDepartment>();
    let pending = scope === 'current' ? [1] : [];
    const visited = new Set<number>();
    while (pending.length > 0 && visited.size < 200) {
      const batch = pending.splice(0, 8).filter((id) => !visited.has(id));
      batch.forEach((id) => visited.add(id));
      await Promise.all(batch.map(async (parentId) => {
        const children = await legacyCall<RawDepartment[]>(token, 'topapi/v2/department/listsub', { dept_id: parentId, language: 'zh_CN' });
        for (const department of children) {
          if (typeof department.dept_id !== 'number' || !department.name) continue;
          departments.set(department.dept_id, department);
          if (!visited.has(department.dept_id)) pending.push(department.dept_id);
        }
      }));
    }

    const departmentIds = [...departments.keys()];
    for (let index = 0; index < departmentIds.length; index += 20) {
      await Promise.all(departmentIds.slice(index, index + 20).map(async (departmentId) => {
        const detail = await legacyCall<RawDepartment>(token, 'topapi/v2/department/get', { dept_id: departmentId, language: 'zh_CN' });
        departmentDetails.set(departmentId, detail);
      }));
    }

    const onJobIds = await employeeIds(token, 'topapi/smartwork/hrm/employee/queryonjob', '2,3,5,-1');
    const cachedCurrent=scope==='departed'?await readPersistentCache('current') as {employees?:NormalizedEmployee[]}|null:null;
    const onJobSet = new Set([...onJobIds.map((id)=>id.trim()),...(cachedCurrent?.employees??[]).map((employee)=>employee.id.trim())]);
    const onJobNames = new Set((cachedCurrent?.employees??[]).map((employee)=>normalizePersonName(employee.name)));
    const resignedIds = scope === 'departed' ? (await employeeIds(token, 'topapi/smartwork/hrm/employee/querydimission')).filter((id)=>!onJobSet.has(id.trim())) : [];
    const resignedSet = new Set(resignedIds);
    let dimissionBatches:DimissionInfo[][]=[];
    if(scope==='departed')try{dimissionBatches=await Promise.all(Array.from({length:Math.ceil(resignedIds.length/50)},(_,batchIndex)=>legacyCall<DimissionInfo[]>(token,'topapi/smartwork/hrm/employee/listdimission',{userid_list:resignedIds.slice(batchIndex*50,batchIndex*50+50).join(',')})))}catch{/* Roster transfer still works when detailed dimission permission is unavailable. */}
    const dimissionById=new Map(dimissionBatches.flat().filter((item)=>item.userid).map((item)=>[item.userid!,item]));
    const allIds = scope === 'current' ? onJobIds : resignedIds;
    const recordBatches = await Promise.all(Array.from({ length: Math.ceil(allIds.length / 100) }, (_, batchIndex) => {
      const index = batchIndex * 100;
      return legacyCall<HrmRecord[]>(token, 'topapi/smartwork/hrm/employee/v2/list', {
        agentid: agentId,
        userid_list: allIds.slice(index, index + 100).join(','),
        field_filter_list: HRM_FIELDS.join(','),
      });
    }));
    const records = recordBatches.flat();

    let employees = records.filter((record) => {
      const name = firstValue(record, 'sys00-name');
      const currentlyOnJob=scope==='departed'&&(onJobSet.has(record.userid?.trim()??'')||onJobNames.has(normalizePersonName(name)));
      return record.userid && name && !currentlyOnJob && !EXCLUDED_EMPLOYEE_IDS.has(record.userid) && !EXCLUDED_EMPLOYEE_NAMES.has(name);
    }).map((record) => {
      const employeeType = firstValue(record, 'sys01-employeeType');
      const excludedDepartments = MEMBERSHIP_EXCLUSIONS.get(record.userid!);
      const departmentIdsForEmployee = values(record, 'sys00-deptIds').flatMap((value) => value.split(/[|,]/)).map((value) => value.trim()==='-1'?'1':value.trim()).filter((id)=>id&&!excludedDepartments?.has(id));
      return {
        id: record.userid!, name: firstValue(record, 'sys00-name'), nickname: '', title: firstValue(record, 'sys00-position'), departmentIds: departmentIdsForEmployee,
        employeeType, employeeStatus: firstValue(record, 'sys01-employeeStatus'),
        rosterStatus: resignedSet.has(record.userid!) ? '离职' : employeeType.includes('兼职') ? '兼职' : '在职',
        hireDate: dateValue(firstValue(record, 'sys00-confirmJoinTime')),
        regularDate: dateValue(firstValue(record, 'sys01-regularTime') || firstValue(record, 'sys01-planRegularTime')),
        certificateNoMasked: maskedCertificate(firstValue(record, 'sys02-certNo')),
        departureDate:dateValue(String(dimissionById.get(record.userid!)?.last_work_day??'')),
      };
    });
    const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));
    const employeeIdsByName = new Map(employees.map((employee) => [employee.name, employee.id]));
    const normalizedDepartments:NormalizedDepartment[] = [...departments.values()].map((department) => {
      const overrideName = MANAGER_OVERRIDES[department.name!];
      const overrideId = overrideName ? employeeIdsByName.get(overrideName) : undefined;
      const ids = overrideId ? [overrideId] : managerIds(departmentDetails.get(department.dept_id!)?.dept_manager_userid_list);
      return { id:String(department.dept_id), name:DEPARTMENT_NAME_OVERRIDES[department.name!]??department.name!, parentId:String(department.parent_id??1), order:department.order??0, managerIds:ids, managerNames:ids.map((id)=>employeeNames.get(id)).filter(Boolean) };
    });
    employees=await syncRosterProfiles(scope,employees,normalizedDepartments);

    const payload = {
      source: '钉钉智能人事花名册', scope, organizationName, syncedAt: new Date().toISOString(),
      departments: normalizedDepartments,
      employees,
    };
    responseCache.set(scope, { expiresAt: Date.now() + CACHE_TTL, data: payload });
    await writePersistentCache(scope,payload);
    return NextResponse.json(payload, { headers: { 'cache-control': 'private, max-age=60', 'x-data-cache': 'miss' } });
  } catch (error) {
    console.error('dingtalk_sync_failed', error instanceof Error ? error.message : 'UnknownError');
    return NextResponse.json({ error: '钉钉智能人事数据暂时不可用，请检查应用权限或稍后重试' }, { status: 502 });
  }
}
