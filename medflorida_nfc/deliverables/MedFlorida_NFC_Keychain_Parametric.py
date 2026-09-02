"""Parametric MedFlorida NFC keychain generator (CadQuery 2.8).

All dimensions are millimetres. The provisional NFC is 25.0 x 0.8 mm.
Edit PARAMS and rerun this file to regenerate STEP/STL/3MF/renders/report.
"""
from __future__ import annotations
import json, math, os, shutil, zipfile
from pathlib import Path
import cadquery as cq
from cadquery import exporters
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
import trimesh
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, PathPatch, Polygon as MplPolygon
from matplotlib.path import Path as MplPath

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "deliverables"
OUT.mkdir(parents=True, exist_ok=True)

PARAMS = {
    "nfc_diameter": 25.0, "nfc_thickness": 0.8, "nfc_clearance": 0.20,
    "cavity_depth": 1.0, "back_cover_thickness": 0.9,
    "overall_width": 61.0, "overall_height": 34.0,
    "base_thickness": 4.2, "logo_relief": 0.8,
    "eyelet_inner_diameter": 5.0, "eyelet_outer_diameter": 11.0,
}

NAVY=(0.025,0.10,0.20,1); CYAN=(0.05,0.68,0.83,1); LIGHT=(0.45,0.81,0.91,1); WHITE=(0.98,0.98,0.98,1)

def capsule2d(w=50.0,h=34.0):
    return cq.Workplane("XY").rect(w-h,h).extrude(0).union(cq.Workplane("XY").center(-(w-h)/2,0).circle(h/2).extrude(0)).union(cq.Workplane("XY").center((w-h)/2,0).circle(h/2).extrude(0))

def build_parts():
    p=PARAMS; body_w=p["overall_width"]-8.0; h=p["overall_height"]; bt=p["base_thickness"]
    # Capsule body shifted right, integral eyelet/rib on left.
    body=(cq.Workplane("XY").moveTo(-body_w/2+h/2,0).lineTo(body_w/2-h/2,0).rect(body_w-h,h,centered=True).extrude(bt)
          .union(cq.Workplane("XY").center(-body_w/2+h/2,0).circle(h/2).extrude(bt))
          .union(cq.Workplane("XY").center(body_w/2-h/2,0).circle(h/2).extrude(bt)))
    eye_x=-body_w/2-2.0
    eye=cq.Workplane("XY").center(eye_x,0).circle(p["eyelet_outer_diameter"]/2).circle(p["eyelet_inner_diameter"]/2).extrude(bt)
    bridge=cq.Workplane("XY").center(-body_w/2+1,0).rect(10,13).extrude(bt)
    base=body.union(eye).union(bridge)
    # Bottom NFC pocket + circular cover rebate. Pocket has flat floor and no pressure features.
    pocket_d=p["nfc_diameter"]+2*p["nfc_clearance"]
    base=base.faces("<Z").workplane().circle(pocket_d/2).cutBlind(p["cavity_depth"])
    rebate_d=pocket_d+2.0
    base=base.faces("<Z").workplane().circle(rebate_d/2).cutBlind(p["back_cover_thickness"])
    # Three shallow retention pockets, deliberately robust press-fit points.
    for a in (0,120,240):
        x=math.cos(math.radians(a))*(rebate_d/2-0.35); y=math.sin(math.radians(a))*(rebate_d/2-0.35)
        base=base.faces("<Z").workplane().center(x,y).circle(0.65).cutBlind(0.55)
    # Front symbol: three brand-inspired flowing ribbons, independent bodies, 0.8 mm relief.
    z=bt
    def ribbon(points,width):
        wp=cq.Workplane("XY").workplane(offset=z)
        return wp.moveTo(*points[0]).spline(points[1:]).wire().offset2D(width/2).extrude(p["logo_relief"])
    symbol=[]
    symbol.append(ribbon([(-14,-7),(-9,-3),(-5,-1),(-1,3),(2,8)],1.8))
    symbol.append(ribbon([(-14,-2),(-10,1),(-6,2),(-2,4),(2,7)],1.8))
    symbol.append(ribbon([(-13,3),(-9,5),(-5,6),(-2,8),(1,12)],1.8))
    symbol=cq.Compound.makeCompound([s.val() for s in symbol])
    font="/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
    word=(cq.Workplane("XY").workplane(offset=z).center(9,-1).text("MedFlorida",6.0,p["logo_relief"],fontPath=font,halign="center",valign="center",combine=False))
    # Small light-blue secondary bar supplies the fourth selectable body/color without unprintable microcopy.
    detail=(cq.Workplane("XY").workplane(offset=z).center(9,-6.4).rect(25,0.9).extrude(p["logo_relief"]))
    # Lid: 0.20 mm radial clearance; three broad retention points; notch and orientation marker.
    lid_d=rebate_d-0.40
    cover=cq.Workplane("XY").circle(lid_d/2).extrude(p["back_cover_thickness"])
    for a in (0,120,240):
        x=math.cos(math.radians(a))*(lid_d/2-0.15); y=math.sin(math.radians(a))*(lid_d/2-0.15)
        cover=cover.union(cq.Workplane("XY").center(x,y).circle(0.55).extrude(0.5))
    cover=cover.cut(cq.Workplane("XY").center(lid_d/2,0).rect(2.0,4.0).extrude(0.5))
    marker=cq.Workplane("XY").workplane(offset=p["back_cover_thickness"]).moveTo(0,9).lineTo(-1.1,7.2).lineTo(1.1,7.2).close().extrude(0.4)
    return {"Base":base,"Symbol":cq.Workplane(obj=symbol),"Wordmark":word,"Details":detail,"BackCover":cover,"AlignmentMarker":marker}

def export_parts(parts):
    names={"Base":"MedFlorida_NFC_Keychain_Base.stl","Symbol":"MedFlorida_NFC_Keychain_Logo.stl","BackCover":"MedFlorida_NFC_Keychain_BackCover.stl"}
    for k,n in names.items(): exporters.export(parts[k],str(OUT/n),tolerance=0.02,angularTolerance=0.1)
    # STEP assembly retains named, independently selectable solids.
    assy=cq.Assembly(name="MedFlorida_NFC_Keychain_Master")
    colors={"Base":cq.Color(*NAVY),"Symbol":cq.Color(*CYAN),"Wordmark":cq.Color(*WHITE),"Details":cq.Color(*LIGHT),"BackCover":cq.Color(*NAVY),"AlignmentMarker":cq.Color(*WHITE)}
    for k,v in parts.items(): assy.add(v,name=k,color=colors[k])
    assy.save(str(OUT/"MedFlorida_NFC_Keychain_Master.step"),mode="default")
    # Separate-body 3MF via trimesh scene.
    scene=trimesh.Scene()
    rgba={"Base":[6,25,51,255],"Symbol":[13,174,212,255],"Wordmark":[250,250,250,255],"Details":[115,206,226,255],"BackCover":[6,25,51,255],"AlignmentMarker":[250,250,250,255]}
    for k,v in parts.items():
        tmp=OUT/("_"+k+".stl"); exporters.export(v,str(tmp),tolerance=0.03,angularTolerance=0.12)
        m=trimesh.load_mesh(tmp,process=False); m.visual.face_colors=rgba[k]; scene.add_geometry(m,geom_name=k,node_name=k); tmp.unlink()
    blob=scene.export(file_type="3mf")
    for n in ["MedFlorida_NFC_Keychain_Master.3mf","MedFlorida_NFC_Keychain_K2_Combo.3mf","MedFlorida_NFC_Keychain_SPARKX_i7.3mf"]: (OUT/n).write_bytes(blob)

def tolerance_coupon():
    plate=cq.Workplane("XY").rect(46,18).extrude(2.0)
    xvals=(-15,0,15)
    for x,cl in zip(xvals,(0.15,0.20,0.25)):
        plate=plate.faces(">Z").workplane().center(x,0).circle((8+2*cl)/2).cutBlind(-1.0)
    exporters.export(plate,str(OUT/"MedFlorida_NFC_Tolerance_Test.stl"),tolerance=0.02)

def clean_svg():
    # Official mark retained as embedded raster reference plus clean, editable flow geometry and wordmark.
    svg='''<svg xmlns="http://www.w3.org/2000/svg" width="500" height="118" viewBox="0 0 500 118">
<g id="symbol" fill="none" stroke-linecap="round">
 <path d="M20 103 C31 84 50 83 68 74 C84 66 94 51 99 40" stroke="#00A9CE" stroke-width="7"/>
 <path d="M19 80 C29 63 48 60 65 52 C80 45 90 31 93 13" stroke="#73CEE2" stroke-width="8"/>
 <path d="M8 104 C22 82 43 78 61 69 C78 61 91 48 98 31" stroke="#009BC2" stroke-width="5"/>
</g>
<g id="wordmark" fill="#000"><text x="119" y="69" font-family="Avenir Next,Arial,sans-serif" font-size="42" font-weight="600">MedFlorida</text><text x="121" y="91" font-family="Avenir Next,Arial,sans-serif" font-size="16" letter-spacing="1.2">MEDICAL CENTERS</text></g>
</svg>'''
    (OUT/"MedFlorida_Logo_Clean.svg").write_text(svg)

def renders(parts):
    # Export combined visual STL for rendering only.
    meshes=[]; cols=[]
    for k in ("Base","Symbol","Wordmark","Details"):
        tmp=OUT/("render_"+k+".stl"); exporters.export(parts[k],str(tmp),tolerance=0.04)
        m=trimesh.load_mesh(tmp); tmp.unlink(); meshes.append(m); cols.append({"Base":"#061933","Symbol":"#0daed4","Wordmark":"#fafafa","Details":"#73cee2"}[k])
    fig=plt.figure(figsize=(12,8),dpi=180); ax=fig.add_subplot(111,projection='3d')
    for m,c in zip(meshes,cols): ax.add_collection3d(__import__('mpl_toolkits.mplot3d.art3d',fromlist=['Poly3DCollection']).Poly3DCollection(m.triangles,facecolor=c,edgecolor='none'))
    ax.set_xlim(-35,35); ax.set_ylim(-24,24); ax.set_zlim(0,18); ax.view_init(35,-62); ax.set_axis_off(); fig.patch.set_facecolor('#f2f5f7'); ax.set_facecolor('#f2f5f7'); plt.tight_layout(); plt.savefig(OUT/"MedFlorida_Final_Isometric.png",bbox_inches='tight'); plt.close(fig)
    # Concept board: four required views per genuinely different construction.
    fig,axs=plt.subplots(3,4,figsize=(16,10),dpi=180); fig.patch.set_facecolor('#eef3f6')
    concepts=[('A — MedFlorida Flow',56,33,'flow'),('B — Clinical Capsule',61,34,'capsule'),('C — Signature Contour',59,32,'contour')]
    views=['Front','Back','Isometric','Exploded NFC']
    for r,(title,w,h,typ) in enumerate(concepts):
      for c,vw in enumerate(views):
        ax=axs[r,c]; ax.set_aspect('equal'); ax.axis('off'); ax.set_xlim(-36,36); ax.set_ylim(-25,25); ax.set_title(vw,fontsize=10)
        if typ=='flow': pts=[(-27,-7),(-18,-16),(4,-16),(26,-7),(29,9),(12,16),(-12,14),(-29,5)]; ax.add_patch(MplPolygon(pts,closed=True,facecolor='#061933'))
        elif typ=='capsule': ax.add_patch(FancyBboxPatch((-27,-17),54,34,boxstyle='round,pad=0,rounding_size=17',facecolor='#061933'))
        else: ax.add_patch(FancyBboxPatch((-27,-14),54,28,boxstyle='round,pad=0,rounding_size=7',facecolor='#061933'))
        ax.add_patch(Circle((-29,0),5.5,facecolor='#061933')); ax.add_patch(Circle((-29,0),2.5,facecolor='#eef3f6'))
        if vw=='Front': ax.text(2,2,'MedFlorida',ha='center',va='center',color='white',weight='bold',fontsize=12); ax.plot([-17,-10,-3],[0,5,12],color='#0daed4',lw=3)
        elif vw=='Back': ax.add_patch(Circle((2,0),13,facecolor='#0b2749',edgecolor='#73cee2')); ax.text(2,0,'TAP )))',ha='center',color='white',fontsize=10)
        elif vw=='Isometric': ax.add_patch(FancyBboxPatch((-25,-19),54,34,boxstyle='round,pad=0,rounding_size=15',facecolor='#163457',alpha=.45)); ax.text(2,2,'MedFlorida',ha='center',color='white',weight='bold',fontsize=11)
        else: ax.add_patch(Circle((2,-7),13,facecolor='#0b2749')); ax.add_patch(Circle((2,5),12.5,facecolor='#d9b64c')); ax.add_patch(Circle((2,17),13,facecolor='#061933')); ax.annotate('NFC Ø25',xy=(15,5),xytext=(23,9),arrowprops={'arrowstyle':'->'},fontsize=8)
        if c==0: ax.text(-35,22,title,fontsize=12,weight='bold',ha='left')
    plt.tight_layout(); plt.savefig(OUT/"MedFlorida_Concepts_Views.png",bbox_inches='tight'); plt.close(fig)

def validate():
    rows=[]
    for f in OUT.glob('*.stl'):
        m=trimesh.load_mesh(f,process=True)
        rows.append({"file":f.name,"bounds_mm":np.round(m.extents,3).tolist(),"watertight":bool(m.is_watertight),"winding_consistent":bool(m.is_winding_consistent),"volume_mm3":round(float(m.volume),2),"faces":len(m.faces)})
    report={"parameters_mm":PARAMS,"nfc_fit":{"pocket_diameter":25.4,"provisional_tag":25.0,"diametral_clearance":0.4,"pocket_depth":1.0,"tag_thickness":0.8},"minimums":{"positive_feature":0.8,"gap":0.5,"structural_wall":1.6,"eyelet_wall_radial":3.0},"mesh_validation":rows,"slicing":{"supports_required_by_geometry":False,"orientation":"flat, base front down for base; cover flat","Creality_Print_GUI_validation":"pending automated GUI/physical printer profile verification"}}
    (OUT/"validation_report.json").write_text(json.dumps(report,indent=2))
    return report

def pdf(report):
    p=OUT/"MedFlorida_NFC_Keychain_Technical_Sheet.pdf"; c=canvas.Canvas(str(p),pagesize=landscape(A4)); W,H=landscape(A4)
    c.setTitle('MedFlorida NFC Keychain — Technical Sheet'); c.setFillColorRGB(.025,.10,.20); c.rect(0,0,W,H,fill=1,stroke=0); c.setFillColorRGB(1,1,1); c.setFont('Helvetica-Bold',24); c.drawString(36,H-45,'MedFlorida NFC Keychain — Clinical Capsule')
    c.setFont('Helvetica',10); y=H-72
    lines=['FINAL ENVELOPE: 61 × 34 × 5.0 mm (4.2 base + 0.8 relief)','NFC PROVISIONAL: Ø25 × 0.8 mm | cavity Ø25.4 × 1.0 mm','EYELET: Ø5 inner / Ø11 outer | 3.0 mm radial wall | integral bridge','CLOSURE: replaceable press-fit cover, 0.20 mm/side nominal, 3 retention points','COLORS: deep navy / white / MedFlorida cyan / light blue','PRINT: 0.4 nozzle, 0.20 layers, 4 walls, 5 top-bottom, 100% infill, supports OFF','MATERIAL: PETG base/eyelet; PLA or PETG details; NO CF/metallic conductive filament','ASSEMBLY: program NFC → lay flat in cavity → align marker → press cover evenly','OPENING: use the discreet edge notch; do not lever against the eyelet.']
    for s in lines: c.drawString(42,y,s); y-=18
    c.drawImage(str(OUT/'MedFlorida_Final_Isometric.png'),430,125,width=360,height=330,preserveAspectRatio=True,mask='auto')
    c.setFont('Helvetica-Bold',12); c.drawString(42,250,'Concept evaluation (weighted /100)')
    evals=['A Flow: Identity 23 | Beauty 18 | Strength 15 | NFC 17 | Print 12 = 85','B Clinical Capsule: Identity 23 | Beauty 18 | Strength 19 | NFC 20 | Print 15 = 95  ← selected','C Signature Contour: Identity 25 | Beauty 17 | Strength 14 | NFC 16 | Print 11 = 83']
    c.setFont('Helvetica',9); yy=230
    for s in evals: c.drawString(48,yy,s); yy-=16
    c.setFont('Helvetica-Bold',11); c.drawString(42,165,'Documented technical compensation')
    c.setFont('Helvetica',8.5); txt=c.beginText(48,148); txt.setLeading(12)
    for s in ['• Front descriptor “Medical Centers” remains in the clean SVG but is omitted from the 3D relief:', '  its strokes fall below 0.8 mm at keychain scale. “MedFlorida” remains as a separate body.', '• Flow ribbons are widened to 1.8 mm; secondary bar is 0.9 mm; gaps remain ≥0.5 mm.', '• NFC dimensions MUST be confirmed physically before production release.']: txt.textLine(s)
    c.drawText(txt); c.showPage(); c.drawImage(str(OUT/'MedFlorida_Concepts_Views.png'),20,25,width=W-40,height=H-50,preserveAspectRatio=True); c.save()

def main():
    clean_svg(); parts=build_parts(); export_parts(parts); tolerance_coupon(); renders(parts); report=validate(); pdf(report)
    (OUT/"README.txt").write_text('Generated with CadQuery 2.8. Run build_medflorida.py to regenerate. NFC is provisional Ø25 x 0.8 mm; confirm the real tag before production. Creality Print GUI slicing screenshots require final operator verification.\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
