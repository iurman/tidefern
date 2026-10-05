from PIL import Image, ImageFilter
import numpy as np, colorsys, potrace, json
SRC='../../../../assets/brand/reference/tidefern-mark-reference.png'
UP=8
im=Image.open(SRC).convert('RGBA')
bg=Image.new('RGBA',im.size,(247,245,239,255)); im=Image.alpha_composite(bg,im).convert('RGB')
im=im.resize((im.width*UP, im.height*UP), Image.LANCZOS)
a=np.array(im).astype(float)/255
H,W,_=a.shape
# vectorized HSV
r,g,b=a[...,0],a[...,1],a[...,2]
mx=a.max(-1); mn=a.min(-1); d=mx-mn
sat=np.where(mx>0,d/np.maximum(mx,1e-6),0)
hue=np.zeros_like(mx)
m=d>1e-6
rc=np.where(m,(mx-r)/np.maximum(d,1e-6),0); gc=np.where(m,(mx-g)/np.maximum(d,1e-6),0); bc=np.where(m,(mx-b)/np.maximum(d,1e-6),0)
hue=np.where(mx==r, bc-gc, np.where(mx==g, 2+rc-bc, 4+gc-rc)); hue=(hue/6.0)%1.0*360
teal=(sat>0.17)&(hue>150)&(hue<205)
green=(sat>0.12)&(hue>=60)&(hue<150)
def tomask(arr): return Image.fromarray((arr*255).astype(np.uint8))
def frommask(img): return np.array(img)>127
# clean small specks
teal_i=tomask(teal).filter(ImageFilter.MedianFilter(5)); green_i=tomask(green).filter(ImageFilter.MedianFilter(5))
teal=frommask(teal_i); green=frommask(green_i)
# closing of teal to recover the highlight gap: dilate then erode
k=int(UP*7)|1
closed=frommask(teal_i.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)))
light=(sat<0.12)&(mx>0.85)
highlight=closed & ~teal & light & ~green
highlight=frommask(tomask(highlight).filter(ImageFilter.MedianFilter(5)))
wave=teal|highlight
def smooth(mask, r=UP*1.6, level=124):
    # a wide blur then a threshold rounds every lump the raster edge left behind, like sanding a cut edge
    img=tomask(mask).filter(ImageFilter.GaussianBlur(r)); return np.array(img)>level
wave=smooth(frommask(tomask(wave).filter(ImageFilter.MedianFilter(7))), r=UP*2.2)
# keep the highlight band inside the wave so it never notches the outline
inset=frommask(tomask(wave).filter(ImageFilter.MinFilter(int(UP*2.5)|1)))
highlight=smooth(highlight & inset, r=UP*1.4)
green=smooth(frommask(tomask(green).filter(ImageFilter.MedianFilter(5))), r=UP*1.25)
print('teal',teal.sum(),'highlight',highlight.sum(),'green',green.sum())
# sample colors
def med(mask): px=(a[mask]*255); return '#%02X%02X%02X'%tuple(np.median(px,axis=0).astype(int))
print('wave color',med(teal),'green color',med(green))
# bounding box of everything
ys,xs=np.where(wave|green); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
print('bbox',x0,x1,y0,y1,'img',W,H)
# fit into 512 with margin
margin=28; bw,bh=x1-x0+1,y1-y0+1; s=(512-2*margin)/max(bw,bh)
ox=(512-bw*s)/2-x0*s; oy=(512-bh*s)/2-y0*s
def trace(mask, turd=500, tol=1.0):
    bm=potrace.Bitmap(((~mask).astype(np.uint8))*255)
    path=bm.trace(turdsize=turd, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.33, opticurve=True, opttolerance=tol)
    parts=[]
    def P(p): return f"{p.x*s+ox:.1f} {p.y*s+oy:.1f}"
    for curve in path.curves:
        sp=curve.start_point; d=[f"M{P(sp)}"]
        for seg in curve.segments:
            if seg.is_corner: d.append(f"L{P(seg.c)} L{P(seg.end_point)}")
            else: d.append(f"C{P(seg.c1)} {P(seg.c2)} {P(seg.end_point)}")
        d.append('Z'); parts.append(' '.join(d))
    return ' '.join(parts)
paths={'wave':trace(wave,tol=1.3),'highlight':trace(highlight,turd=400,tol=1.2),'frond':trace(green,turd=400,tol=0.9)}
json.dump({'paths':paths,'colors':{'wave':med(teal),'green':med(green)}},open('paths.json','w'))
for k,v in paths.items(): print(k,len(v),'chars', v.count('M'),'subpaths')
