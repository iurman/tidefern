import json
d=json.load(open('paths.json')); P=d['paths']
MIST="#F7F5EF"; FERN="#2F4F46"
def svg(title, wave, hi, frond, hi_op=1):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">{title}</title>
  <path fill="{wave}" d="{P['wave']}"/>
  <path fill="{hi}" fill-opacity="{hi_op}" d="{P['highlight']}"/>
  <path fill="{frond}" d="{P['frond']}"/>
</svg>
'''
light=svg("Tidefern mark", d['colors']['wave'], MIST, d['colors']['green'])
out={
 "tidefern-mark.svg": light,
 "tidefern-mark-dark.svg": svg("Tidefern mark for dark surfaces", "#6EA7A0", MIST, "#A9C2A4", 0.9),
 "tidefern-mark-mono.svg": svg("Tidefern mark, one color", FERN, MIST, FERN),
 "tidefern-mark-small.svg": svg("Tidefern mark, small sizes", d['colors']['wave'], MIST, d['colors']['green']),
}
inner="\n".join("  "+l for l in light.split("\n")[2:-2])
out["tidefern-icon.svg"]=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">Tidefern app icon</title>
  <rect width="512" height="512" rx="112" fill="{MIST}"/>
  <g transform="translate(46 46) scale(0.82)">
{inner}
  </g>
</svg>
'''
for n,s in out.items(): open(n,'w').write(s)
print("sizes", {n:len(s) for n,s in out.items()})
