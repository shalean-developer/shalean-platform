import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishScheduledBlogPosts } from "./publish-scheduled-posts";
import type { BlogContentJson } from "./content-json";

const content: BlogContentJson = {schema_version:1,blocks:[
  {type:"rich_text",html:`<h2>Cleaning guide</h2><p>${"Useful cleaning advice. ".repeat(280)}</p>`},
  {type:"faq",items:[{question:"How?",answer:"Use a checklist."}]},
  {type:"internal_links",links:[{label:"Service",url:"/services/standard-cleaning-cape-town"}]},
]};
function database(options: { permitted?: boolean; content?: BlogContentJson; concurrent?: boolean; future?: boolean } = {}) {
  const row: Record<string,unknown>={id:"fixture",slug:"scheduled-fixture",title:"Guide",content_json: options.content ?? content,status:"scheduled",updated_at:"2026-10-20T10:00:00Z",published_at:options.future?"2099-01-01T00:00:00Z":"2026-10-20T11:00:00Z",scheduled_by:"publisher"};
  const admin={
    rpc:async()=>({data:options.permitted!==false,error:null}),
    from(table: string) {
      const filters: [string,unknown][]=[]; let patch: Record<string,unknown> | null = null;
      const q={select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},lte:(key:string,value:unknown)=>{filters.push([`${key}<=`,value]);return q;},not:()=>q,order:()=>q,limit:()=>q,in:()=>q,
        update:(value:Record<string,unknown>)=>{patch=value;return q;},
        maybeSingle:async()=>{const result=await q; return {...result,data:result.data[0]??null};},
        then(resolve:(value:{data:Record<string,unknown>[];error:null})=>unknown) {
          if(table!=="blog_posts") return Promise.resolve(resolve({data:[],error:null}));
          if(patch && options.concurrent && patch.status==="published") row.updated_at="2026-10-20T12:00:00Z";
          const match=filters.every(([key,value])=>key.endsWith("<=") ? String(row[key.slice(0,-2)])<=String(value) : row[key]===value);
          if(match && patch) Object.assign(row,patch);
          return Promise.resolve(resolve({data:match?[{...row}]:[],error:null}));
        },
      }; return q;
    },
  } as unknown as SupabaseClient;
  return {admin,row};
}
const now=new Date("2026-10-20T12:00:00Z");
describe("scheduled publication",()=>{
  it("publishes a due validated post once and invalidates its public cache",async()=>{
    const {admin,row}=database();const invalidated:string[]=[];
    expect(await publishScheduledBlogPosts(admin,s=>invalidated.push(s),now)).toEqual({published:1,held:0,superseded:0});
    expect(row.status).toBe("published");
    expect(await publishScheduledBlogPosts(admin,s=>invalidated.push(s),now)).toEqual({published:0,held:0,superseded:0});
    expect(invalidated).toEqual(["scheduled-fixture"]);
  });
  it("leaves future articles untouched",async()=>{
    const {admin,row}=database({future:true});
    expect((await publishScheduledBlogPosts(admin,()=>{},now)).published).toBe(0); expect(row.status).toBe("scheduled");
  });
  it.each(["permission","quality","links"])("holds a post with invalid %s instead of releasing it",async failure=>{
    const bad= failure==="quality"?{schema_version:1 as const,blocks:[]}: failure==="links"?{...content,blocks:[...content.blocks,{type:"internal_links" as const,links:[{label:"Missing",url:"/blog/missing-cms-only"}]}]}:content;
    const {admin,row}=database({permitted:failure!=="permission",content:bad});
    expect((await publishScheduledBlogPosts(admin,()=>{throw new Error("Must not invalidate")},now)).held).toBe(1);
    expect(row.status).toBe("scheduled"); expect(row.last_schedule_error).toBeTruthy();
  });
  it("records a published result and cache warning if invalidation is temporarily unavailable",async()=>{
    const {admin,row}=database();
    expect(await publishScheduledBlogPosts(admin,()=>{throw new Error("Cache unavailable")},now)).toEqual({published:1,held:0,superseded:0,cache_pending:1});
    expect(row.status).toBe("published");
  });
  it("does not overwrite an article edited while its publication was being validated",async()=>{
    const {admin,row}=database({concurrent:true});
    expect(await publishScheduledBlogPosts(admin,()=>{throw new Error("Must not invalidate")},now)).toEqual({published:0,held:0,superseded:1});
    expect(row.status).toBe("scheduled");
  });
});
