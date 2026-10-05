"""Second pass: resample each traced outline, run a Gaussian along it and refit smooth cubic curves,
so the hand-tremor left by the raster edge disappears while the shape stays where it was."""
import json, re, math
import numpy as np
P=json.load(open('paths.json'))
def parse(d):
    subs=[]; cur=None; pos=None
    for tok in re.findall(r'[MLCZ][^MLCZ]*', d):
        cmd=tok[0]; nums=[float(x) for x in tok[1:].split()]
        if cmd=='M': cur=[(nums[0],nums[1])]; pos=(nums[0],nums[1]); subs.append(cur)
        elif cmd=='L': cur.append((nums[0],nums[1])); pos=(nums[0],nums[1])
        elif cmd=='C':
            p0=pos; p1=(nums[0],nums[1]); p2=(nums[2],nums[3]); p3=(nums[4],nums[5])
            for i in range(1,13):
                t=i/12; u=1-t
                cur.append((u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]))
            pos=p3
    return subs
def resample(pts, step=1.5):
    pts=np.array(pts); 
    if np.allclose(pts[0],pts[-1]): pts=pts[:-1]
    closed=np.vstack([pts,pts[:1]]); seg=np.linalg.norm(np.diff(closed,axis=0),axis=1); L=seg.sum()
    n=max(24,int(L/step)); cum=np.concatenate([[0],np.cumsum(seg)]); s=np.linspace(0,L,n,endpoint=False)
    x=np.interp(s,cum,closed[:,0]); y=np.interp(s,cum,closed[:,1]); return np.column_stack([x,y]), L
def gauss_smooth(pts, sigma_pts):
    n=len(pts); k=int(sigma_pts*3)
    idx=np.arange(-k,k+1); w=np.exp(-0.5*(idx/sigma_pts)**2); w/=w.sum()
    out=np.zeros_like(pts)
    for i,wi in zip(idx,w): out+=wi*np.roll(pts,-i,axis=0)
    return out
def area(pts): x,y=pts[:,0],pts[:,1]; return 0.5*abs(np.dot(x,np.roll(y,-1))-np.dot(y,np.roll(x,-1)))
def to_path(pts, every):
    q=pts[::every]; n=len(q); d=[f"M{q[0][0]:.1f} {q[0][1]:.1f}"]
    for i in range(n):
        p0=q[(i-1)%n]; p1=q[i]; p2=q[(i+1)%n]; p3=q[(i+2)%n]
        c1=p1+(p2-p0)/6; c2=p2-(p3-p1)/6
        d.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    d.append('Z'); return ' '.join(d)
out={}
for name,d in P['paths'].items():
    parts=[]
    for sub in parse(d):
        pts,L=resample(sub)
        if area(pts)<60: continue
        # smoothing window scales with the outline: long outlines (wave) get a wider sweep than a leaflet
        # the wave and its highlight take a wide sweep; the frond keeps a gentle one so the necks where
        # leaflets meet the stem stay crisp
        sigma=max(2.0, min(len(pts)*0.012, 9.0)) if name!='frond' else 2.4
        sm=gauss_smooth(pts, sigma)
        # Gaussian smoothing shrinks convex shapes slightly; scale back to the original area about the centroid
        c=sm.mean(axis=0); sm=c+(sm-c)*math.sqrt(area(pts)/max(area(sm),1e-6))
        parts.append(to_path(sm, every=max(3,int(len(sm)/(48 if name!='frond' else 110)))))
    out[name]=' '.join(parts)
P['paths']=out
json.dump(P,open('paths.json','w'))
print({k:(len(v), v.count('M')) for k,v in out.items()})
