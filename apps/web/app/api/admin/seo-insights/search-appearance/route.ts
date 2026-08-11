import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURE_TYPES = ["featured_snippet","local_pack","people_also_ask","images","video","ai_overview","knowledge_panel","other"] as const;

type FeatureRow = {
  id:string;
  keyword_id:string;
  feature_type:string;
  owner_type:"shalean"|"competitor"|"other"|"unowned";
  owner_domain:string|null;
  url:string|null;
  title:string|null;
  position:number|null;
  observed_at:string;
};

type KeywordRow = {
  id:string;
  keyword:string;
  target_path:string|null;
  service_name?:string|null;
  intent?:string|null;
  priority:string;
  active:boolean;
};

export async function GET(request:Request){
  const auth=await requireAdminApi(request);
  if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin();
  if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});

  const [{data:keywords,error:keywordError},{data:features,error:featureError}] = await Promise.all([
    admin.from("seo_tracked_keywords").select("id,keyword,target_path,service_name,intent,priority,active").eq("active",true).order("priority",{ascending:true}).order("keyword",{ascending:true}),
    admin.from("seo_serp_features").select("id,keyword_id,feature_type,owner_type,owner_domain,url,title,position,observed_at").order("observed_at",{ascending:false}).limit(5000),
  ]);
  if(keywordError) return NextResponse.json({error:keywordError.message},{status:500});
  if(featureError) return NextResponse.json({error:featureError.message},{status:500});

  const latestByKeywordFeature=new Map<string,FeatureRow[]>();
  const latestTimeByKey=new Map<string,string>();
  for(const row of (features??[]) as FeatureRow[]){
    const key=`${row.keyword_id}:${row.feature_type}`;
    const latestTime=latestTimeByKey.get(key);
    if(!latestTime){
      latestTimeByKey.set(key,row.observed_at);
      latestByKeywordFeature.set(key,[row]);
    }else if(row.observed_at===latestTime){
      latestByKeywordFeature.get(key)!.push(row);
    }
  }

  const rows=((keywords??[]) as KeywordRow[]).flatMap((keyword)=>{
    const observed=FEATURE_TYPES.flatMap((featureType)=>latestByKeywordFeature.get(`${keyword.id}:${featureType}`)??[]);
    if(!observed.length){
      return [{
        keyword_id:keyword.id,keyword:keyword.keyword,target_path:keyword.target_path,service_name:keyword.service_name??null,intent:keyword.intent??null,priority:keyword.priority,
        feature_type:null,owner_type:"unowned" as const,owner_domain:null,url:null,title:null,position:null,observed_at:null,status:"no_data" as const,
      }];
    }
    return observed.map((feature)=>({
      keyword_id:keyword.id,keyword:keyword.keyword,target_path:keyword.target_path,service_name:keyword.service_name??null,intent:keyword.intent??null,priority:keyword.priority,
      feature_type:feature.feature_type,owner_type:feature.owner_type,owner_domain:feature.owner_domain,url:feature.url,title:feature.title,position:feature.position,observed_at:feature.observed_at,
      status:feature.owner_type==="shalean"?"win":feature.owner_type==="competitor"?"loss":"opportunity",
    }));
  });

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
