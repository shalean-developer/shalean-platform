import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
import { WordPressPostEditorLayout } from "@/components/admin/blog/WordPressPostEditorLayout";
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";
import { RichTextBlockEditor } from "@/components/admin/blog/RichTextBlockEditor";
import { DocumentBodySection } from "@/components/admin/blog/DocumentBodySection";
vi.stubGlobal("React",React);
afterEach(()=>vi.clearAllMocks());

describe("blog editor rendered layout",()=>{
  it("renders one settings tree and unique IDs with no nested main landmark",()=>{
    const html=renderToStaticMarkup(createElement(PostEditorForm,{mode:"create",postsListPath:"/office/blog"}));
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("wp-excerpt");expect(ids).toContain("wp-can");
    expect(html.match(/<main\b/g)??[]).toHaveLength(0);
    expect(html).toContain("Shared booking section");
  });
  it.each([["draft","Save draft"],["published","Publish post"],["scheduled","Schedule post"]] as const)("labels the create action for %s",(status,label)=>{
    const html=renderToStaticMarkup(createElement(WordPressPostEditorLayout,{mode:"create",status,postsListPath:"/office/blog",saving:false,onSave:()=>{},formError:null,fieldErrors:[],title:"Guide",onTitleChange:()=>{},slug:"guide",onSlugChange:()=>{},slugAuto:false,onSlugAutoChange:()=>{},permalinkPreview:"/blog/guide",body:null,sidebar:null}));
    expect(html).toContain(label);
  });
  it("disables edits during an in-flight save and announces errors",()=>{
    const html=renderToStaticMarkup(createElement(WordPressPostEditorLayout,{mode:"edit",status:"draft",postsListPath:"/office/blog",saving:true,onSave:()=>{},formError:"Connection lost",fieldErrors:[],title:"Guide",onTitleChange:()=>{},slug:"guide",onSlugChange:()=>{},slugAuto:false,onSlugAutoChange:()=>{},permalinkPreview:"/blog/guide",body:null,sidebar:null}));
    expect(html).toMatch(/<fieldset[^>]+disabled/); expect(html).toContain('role="alert"');
  });
  it("preserves authored HTML tables instead of passing them through a lossy visual schema",()=>{
    const html=renderToStaticMarkup(createElement(RichTextBlockEditor,{html:'<table id="price-table"><tbody><tr><td>Keep this cell</td></tr></tbody></table>',onChange:()=>{}}));
    expect(html).toContain('aria-label="Formatted block source"'); expect(html).toContain('price-table'); expect(html).toContain('Keep this cell');
  });
  it("renders middle images and service areas between their original prose blocks",()=>{
    const blocks=[{type:"paragraph" as const,content:"Before"},{type:"image" as const,url:"/images/one.jpg",alt:"Middle"},{type:"service_area" as const,locations:["Claremont"]},{type:"paragraph" as const,content:"After"}];
    const html=renderToStaticMarkup(createElement(DocumentBodySection,{blocks,onBlocksChange:()=>{},renderBlock:b=>JSON.stringify(b),newBlock:()=>({type:"rich_text" as const,html:""})}));
    expect(html.indexOf("Before")).toBeLessThan(html.indexOf("Middle")); expect(html.indexOf("Middle")).toBeLessThan(html.indexOf("Claremont")); expect(html.indexOf("Claremont")).toBeLessThan(html.indexOf("After"));
  });
});
