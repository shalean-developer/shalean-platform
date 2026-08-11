import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURE_TYPES = ["featured_snippet","local_pack","people_also_ask","images","video","ai_overview","knowledge_panel","other"] as const;

type FeatureRow = {
  id:string;
  snapshot_id:string;
  keyword_id:string;
  feature_type:string;
  owner_type:"shalean"|"competitor"|"other"|"unowned";
  owner_domain:string|null;
  url:string|null;
  title:string|null;
  position:number|null;
  observed_at:string;
};

type SnapshotRow = { id:string; keyword_id:string; fetched_at:string };

type KeywordRow = {
  id:string;
  keyword:string;
  target_path:string|null;
  service_name?:string|null;
  intent?:string|null;
  priority:string;
  active:boolean;
};

type SearchAppearanceRow = {
  keyword_id:string;
  keyword:string;
  target_path:string|null;
  service_name:string|null;
  intent:string|null;
  priority:string;
  feature_type:string|null;
  owner_type:"shalean"|"competitor"|"other"|"unowned";
  owner_domain:string|null;
  url:string|null;
  title:string|null;
  position:number|null;
  observed_at:string|null;
  status:"win"|"loss"|"opportunity"|"no_data";
};

export async function GET(request:Request){
  const auth=await requireAdminApi(request);
  if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin();
  if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});

  const [{data:keywords,error:keywordError},{data:snapshots,error:snapshotError},{data:features,error:featureError}] = await Promise.all([
    admin.from("seo_tracked_keywords").select("id,keyword,target_path,service_name,intent,priority,active").eq("active",true).order("priority",{ascending:true}).order("keyword",{ascending:true}),
    admin.from("seo_serp_snapshots").select("id,keyword_id,fetched_at").order("fetched_at",{ascending:false}).limit(5000),
    admin.from("seo_serp_features").select("id,snapshot_id,keyword_id,feature_type,owner_type,owner_domain,url,title,position,observed_at").order("observed_at",{ascending:false}).limit(5000),
  ]);
  if(keywordError) return NextResponse.json({error:keywordError.message},{status:500});
  if(snapshotError) return NextResponse.json({error:snapshotError.message},{status:500});
  if(featureError) return NextResponse.json({error:featureError.message},{status:500});

  const latestSnapshotByKeyword=new Map<string,string>();
  for(const snapshot of (snapshots??[]) as SnapshotRow[]){
    if(!latestSnapshotByKeyword.has(snapshot.keyword_id)) latestSnapshotByKeyword.set(snapshot.keyword_id,snapshot.id);
  }

  const featuresBySnapshot=new Map<string,FeatureRow[]>();
  for(const row of (features??[]) as FeatureRow[]){
    if(latestSnapshotByKeyword.get(row.keyword_id)!==row.snapshot_id) continue;
    const list=featuresBySnapshot.get(row.snapshot_id)??[];
    list.push(row);
    featuresBySnapshot.set(row.snapshot_id,list);
  }

  const rows:SearchAppearanceRow[]=[];
  for(const keyword of (keywords??[]) as KeywordRow[]){
    const latestSnapshotId=latestSnapshotByKeyword.get(keyword.id);
    const observed=latestSnapshotId ? (featuresBySnapshot.get(latestSnapshotId)??[]) : [];
    if(!observed.length){
      rows.push({
        keyword_id:keyword.id,keyword:keyword.keyword,target_path:keyword.target_path,service_name:keyword.service_name??null,intent:keyword.intent??null,priority:keyword.priority,
        feature_type:null,owner_type:"unowned",owner_domain:null,url:null,title:null,position:null,observed_at:null,status:"no_data",
      });
      continue;
    }
    for(const feature of observed){
      rows.push({
        keyword_id:keyword.id,keyword:keyword.keyword,target_path:keyword.target_path,service_name:keyword.service_name??null,intent:keyword.intent??null,priority:keyword.priority,
        feature_type:feature.feature_type,owner_type:feature.owner_type,owner_domain:feature.owner_domain,url:feature.url,title:feature.title,position:feature.position,observed_at:feature.observed_at,
        status:feature.owner_type==="shalean"?"win":feature.owner_type==="competitor"?"loss":"opportunity",
      });
    }
  }

  const withFeature=rows.filter((r)=>r.feature_type!=null);
  return NextResponse.json({
    summary:{
      trackedKeywords:(keywords??[]).length,
      featureObservations:withFeature.length,
      wins:withFeature.filter((r)=>r.owner_type==="shalean").length,
      competitorOwned:withFeature.filter((r)=>r.owner_type==="competitor").length,
      opportunities:withFeature.filter((r)=>r.owner_type==="other"||r.owner_type==="unowned").length,
      noData:rows.filter((r)=>r.status==="no_data").length,
    },
    rows,
    featureTypes:FEATURE_TYPES,
  });
}
