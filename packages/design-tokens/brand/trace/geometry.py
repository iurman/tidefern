"""Rebuild the frond as clean geometry fitted to the traced raster.

trace.py gives us the pixel masks; here the stem becomes a tapered stroke along its
measured centerline, and every leaflet becomes the same teardrop shape, sized and
oriented from the blob it replaces, with one uniform gap to the stem."""
import json, math
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, disk, opening, dilation
from skimage.measure import label, regionprops

exec(open('trace.py').read().split("# bounding box of everything")[0])   # reuse masks: wave, highlight, green, UP, a
ys,xs=np.where(wave|green); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
margin=28; bw,bh=x1-x0+1,y1-y0+1; S=(512-2*margin)/max(bw,bh)
OX=(512-bw*S)/2-x0*S; OY=(512-bh*S)/2-y0*S
def T(x,y): return (x*S+OX, y*S+OY)

# 1. Stem: open the frond with a disk wider than any leaflet neck but narrower than the stem.
lab=label(green)
# the largest component after opening is the stem with its crozier
sizes=np.bincount(lab.ravel()); sizes[0]=0; core=lab==sizes.argmax()
skel=skeletonize(core)
dist=ndi.distance_transform_edt(core)
# order the skeleton as a path: walk from the endpoint nearest the wave (lowest point)
pts=np.argwhere(skel)  # (y,x)
from collections import defaultdict
idx={ (y,x):i for i,(y,x) in enumerate(map(tuple,pts)) }
nbrs=defaultdict(list)
for (y,x) in idx:
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if (dy or dx) and (y+dy,x+dx) in idx: nbrs[(y,x)].append((y+dy,x+dx))
ends=[p for p,n in nbrs.items() if len(n)==1]
# the stem base is the skeleton point nearest the wave: lowest skeleton pixel inside a band around the wave
start=max(idx, key=lambda p:p[0])          # lowest skeleton pixel is the base at the wave
# geodesic: the centerline is the shortest skeleton path from the base to the point farthest from it,
# which is the inner tip of the crozier (every leaflet branch is shorter)
from collections import deque
prev={start:None}; dq=deque([start]); far=start; order=[]
while dq:
    p=dq.popleft(); order.append(p)
    for n in nbrs[p]:
        if n not in prev: prev[n]=p; dq.append(n)
far=order[-1]
path=[]; p=far
while p is not None: path.append(p); p=prev[p]
path=path[::-1]
# resample the centerline and read the half-width from the distance transform
P=np.array([(x,y) for (y,x) in path],float)
seg=np.linalg.norm(np.diff(P,axis=0),axis=1); cum=np.concatenate([[0],np.cumsum(seg)]); L=cum[-1]
n=320; s=np.linspace(0,L,n); cx=np.interp(s,cum,P[:,0]); cy=np.interp(s,cum,P[:,1])
w=np.array([dist[int(round(y)),int(round(x))] for x,y in zip(cx,cy)])
# smooth both the line and the width profile, then make the width a clean monotone taper
def smooth1(v,k):
    kk=np.exp(-0.5*(np.arange(-3*k,3*k+1)/k)**2); kk/=kk.sum(); pad=np.pad(v,3*k,mode='edge'); return np.convolve(pad,kk,mode='valid')
cx=smooth1(cx,8); cy=smooth1(cy,8)
# the width follows the measured half-width, smoothed hard so leaflet junctions do not bulge it,
# which keeps the fiddlehead's rounded inner tip the reference has
w=np.clip(smooth1(w,14), UP*0.9, None)
# extend the base a little into the wave so the stem roots instead of floating
tx,ty=cx[1]-cx[0],cy[1]-cy[0]; nrm=math.hypot(tx,ty); cx=np.concatenate([[cx[0]-tx/nrm*UP*9],cx]); cy=np.concatenate([[cy[0]-ty/nrm*UP*9],cy]); w=np.concatenate([[w[0]],w])
# build the outline polygon of the tapered stroke
# offset both edges; on the inside of a tight bend the offset is clamped to the radius of curvature so the
# outline never folds over itself (a folded outline cancels its own fill)
left=[];right=[]
m=len(cx)
for i in range(m):
    i0=max(i-1,0); i1=min(i+1,m-1); dx=cx[i1]-cx[i0]; dy=cy[i1]-cy[i0]; l=math.hypot(dx,dy) or 1
    tx,ty=dx/l,dy/l; nx,ny=-ty,tx
    j0=max(i-4,0); j1=min(i+4,m-1)
    ax,ay=cx[j0],cy[j0]; bx,by=cx[j1],cy[j1]; qx,qy=cx[i],cy[i]
    # signed curvature from three points
    cross=(qx-ax)*(by-ay)-(qy-ay)*(bx-ax); la=math.hypot(qx-ax,qy-ay); lb=math.hypot(bx-qx,by-qy); lc=math.hypot(bx-ax,by-ay)
    kappa=(2*cross/(la*lb*lc)) if la*lb*lc else 0.0
    R=abs(1/kappa) if kappa else 1e9
    wl=w[i]; wr=w[i]
    if kappa>0: wl=min(wl,R*0.92)      # center of curvature lies on the left side
    elif kappa<0: wr=min(wr,R*0.92)
    left.append((qx+nx*wl,qy+ny*wl)); right.append((qx-nx*wr,qy-ny*wr))
tipx,tipy,tipw=cx[-1],cy[-1],w[-1]
def semicircle(i, sign):
    i0=max(i-1,0); i1=min(i+1,m-1); dx=cx[i1]-cx[i0]; dy=cy[i1]-cy[i0]; l=math.hypot(dx,dy) or 1
    tx,ty=dx/l*sign,dy/l*sign; nx,ny=-ty,tx; r=w[i]
    return [(cx[i]+math.cos(a)*nx*r+math.sin(a)*tx*r, cy[i]+math.cos(a)*ny*r+math.sin(a)*ty*r) for a in np.linspace(0,math.pi,9)[1:-1]]
tip_arc=semicircle(m-1, 1)       # from left edge over the tip to the right edge
base_arc=semicircle(0, -1)       # from right edge around the base to the left edge
stem_poly=left+tip_arc+right[::-1]+base_arc
def catmull(points, closed=True):
    q=np.array(points); n=len(q); d=[f"M{q[0][0]:.1f} {q[0][1]:.1f}"]
    rng=range(n) if closed else range(n-1)
    for i in rng:
        p0=q[(i-1)%n]; p1=q[i]; p2=q[(i+1)%n]; p3=q[(i+2)%n]
        c1=p1+(p2-p0)/6; c2=p2-(p3-p1)/6
        d.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    d.append('Z'); return ' '.join(d)
stem_pts=[T(x,y) for x,y in stem_poly[::3]]
stem_d=catmull(stem_pts)
# round caps: a circle at base and tip
bx,by=T(cx[0],cy[0]); ex,ey=T(tipx,tipy)
caps=[]

# 2. Leaflets: everything green outside the fitted stroke, as separate blobs.
from skimage.draw import polygon as draw_polygon, disk as draw_disk
stroke=np.zeros_like(green)
pr=np.array([p[1] for p in stem_poly]); pc=np.array([p[0] for p in stem_poly])
rr,cc=draw_polygon(pr,pc,shape=stroke.shape); stroke[rr,cc]=True
for x,y,r in zip(cx,cy,w):
    rr,cc=draw_disk((y,x), max(r*1.1,UP*0.6), shape=stroke.shape); stroke[rr,cc]=True
core=stroke
stem_zone=dilation(core, disk(int(UP*0.9)))
leaf_mask=green & ~stem_zone
leaf_mask=opening(leaf_mask, disk(int(UP*0.8)))
ll=label(leaf_mask)
leaves=[]
props=[r for r in regionprops(ll) if r.area >= (UP*UP)*12]
med=np.median([r.area for r in props]) if props else 0
tail=np.column_stack([cx[-int(len(cx)*0.12):],cy[-int(len(cy)*0.12):]])
basept=np.array([cx[0],cy[0]])
for r in props:
    if r.area < med*0.3: continue
    cyc,cxc=r.centroid
    # a blob sitting on the inner tip of the crozier, or on the stem base, is stroke not leaflet
    if np.min(np.linalg.norm(tail-np.array([cxc,cyc]),axis=1)) < UP*3.5: continue
    if np.linalg.norm(basept-np.array([cxc,cyc])) < UP*6: continue
    cyc,cxc=r.centroid; ang=r.orientation          # skimage: angle between the row axis and the major axis
    major=r.axis_major_length; minor=r.axis_minor_length
    # direction of the major axis in (x,y) image coords
    ux,uy=math.sin(ang),math.cos(ang)
    # which end is nearer the stem? the base points toward the nearest stem pixel
    dstem=ndi.distance_transform_edt(~core)
    e1=(cxc+ux*major/2, cyc+uy*major/2); e2=(cxc-ux*major/2, cyc-uy*major/2)
    def dd(p):
        x=int(np.clip(round(p[0]),0,W-1)); y=int(np.clip(round(p[1]),0,H-1)); return dstem[y,x]
    if dd(e1) < dd(e2): ux,uy=-ux,-uy          # make (ux,uy) point from base toward tip
    leaves.append(dict(cx=cxc,cy=cyc,ux=ux,uy=uy,L=major,W=minor,area=r.area))
# uniform gap: slide each leaflet along its axis so its base sits one gap from the stem edge
GAP=UP*1.6
dstem=ndi.distance_transform_edt(~core)
def dist_at(x,y):
    xi=int(np.clip(round(x),0,W-1)); yi=int(np.clip(round(y),0,H-1)); return dstem[yi,xi]
leaf_ds=[]
for lf in leaves:
    Lf=lf['L']*0.98; Wf=lf['W']*0.98
    base=np.array([lf['cx']-lf['ux']*Lf/2, lf['cy']-lf['uy']*Lf/2])
    u=np.array([lf['ux'],lf['uy']])
    # move base along the axis until its distance to the stem equals GAP (search both directions)
    best=None
    for shift in np.linspace(-UP*6, UP*6, 97):
        p=base+u*shift; d=dist_at(*p)
        if best is None or abs(d-GAP)<abs(best[1]-GAP): best=(shift,d)
    base=base+u*best[0]
    # teardrop: base is the narrow end, widest at 45 percent, rounded tip
    nx,ny=-u[1],u[0]
    def pt(tt,side): 
        # width profile along the leaf: sin-shaped with a slightly pointed tip
        wv=Wf/2*math.sin(math.pi*tt)**0.85
        return (base[0]+u[0]*Lf*tt+nx*wv*side, base[1]+u[1]*Lf*tt+ny*wv*side)
    outline=[pt(tt,1) for tt in np.linspace(0.02,0.98,22)]+[pt(tt,-1) for tt in np.linspace(0.98,0.02,22)]
    leaf_ds.append(catmull([T(*p) for p in outline]))
print('leaflets', len(leaf_ds), 'stem length', round(L/UP,1), 'px at 1x; base width', round(w[0]*2/UP,1), 'tip width', round(tipw*2/UP,1))

# 3. Wave and highlight: reuse the smoothed trace from paths.json produced by trace.py + smooth.py
pj=json.load(open('paths.json'))
caps_svg=' '.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}"/>' for x,y,r in caps)
frond=f'<path d="{stem_d}"/>{caps_svg}'+''.join(f'<path d="{d}"/>' for d in leaf_ds)
json.dump({'wave':pj['paths']['wave'],'highlight':pj['paths']['highlight'],'frond_svg':frond,'colors':pj['colors']},open('geometry.json','w'))
