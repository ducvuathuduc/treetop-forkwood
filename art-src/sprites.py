# Sprite manifest: id -> (sources "sheet/NN", max px @2x, type, extra)
# mech = sim trap/mechanic kind this skin dresses (MECHANICS.md ids / v1 sim ids). Final binding is MECH's call.
T = 'sprite'
TRAPS = {
 'meadow': [
  ('meadow.trap.crow', ['trap-meadow/00','trap-meadow/01','trap-meadow/02'], 192, dict(mech='crow', fps=8, anim='flap', note='3-pose wing cycle, play 0-1-2-1')),
  ('meadow.trap.gust', ['trap-meadow/03'], 192, dict(mech='gust', note='spin in code (0.6 turn/s), scale-pulse on warn')),
  ('meadow.trap.crossing', ['trap-meadow/04'], 320, dict(mech='door', note='railway crossing arm; pivot at red lamp (anchor)', anchor=[0.5,0.5])),
  ('meadow.trap.hornet', ['trap-meadow/05','trap-meadow/06'], 128, dict(mech='hornets', fps=12, anim='buzz')),
  ('meadow.trap.briar', ['trap-meadow/07'], 320, dict(mech='pulse', note='thorn row; tile-x by repeating, pulse = scale 1.0->1.06')),
 ],
 'starry': [
  ('starry.trap.crowflock', ['starry/00','starry/01'], 224, dict(mech='crow', fps=6, anim='flap', note='crow flock over wheat (Wheatfield-with-Crows nod, original drawing)')),
  ('starry.trap.crowdive', ['starry/06'], 160, dict(mech='crow', note='single crow dive pose for the lane dive')),
  ('starry.trap.vortex', ['starry/02'], 224, dict(mech='gust', note='swirl vortex; spin in code; red-orange core = telegraph')),
  ('starry.trap.wheatspikes', ['starry/03'], 288, dict(mech='pulse', note='wheat awns thorn row')),
  ('starry.trap.lampsparks', ['starry/05'], 160, dict(mech='embers', glow=1)),
 ],
 'fresco': [
  ('fresco.trap.dove', ['trap-fresco/00','trap-fresco/02'], 160, dict(mech='crow', fps=6, anim='flap', note='stone dove')),
  ('fresco.trap.cherub', ['trap-fresco/01'], 224, dict(mech='cone', note='falling plaster cherub (drop on target circle)')),
  ('fresco.trap.candlewax', ['trap-fresco/03'], 192, dict(mech='embers', note='candle wax drip column (sap/burn zone)')),
  ('fresco.trap.archgate', ['trap-fresco/04'], 320, dict(mech='door', note='stone gate slab; keystone glows on warn')),
  ('fresco.trap.plaster', ['trap-fresco/08'], 192, dict(mech='icicle', glow=1, note='falling plaster chunks')),
 ],
 'ukiyo': [
  ('ukiyo.trap.wavecrest', ['trap-ukiyo/00'], 288, dict(mech='tide', note='tide body lip; tile-x along the rising band')),
  ('ukiyo.trap.onikite', ['trap-ukiyo/01'], 288, dict(mech='pendulum', anchor=[0.5,0.05], note='oni-mask kite swinging on its string; pivot at top')),
  ('ukiyo.trap.cormorant', ['trap-ukiyo/02','trap-ukiyo/03'], 192, dict(mech='crow', fps=6, anim='flap')),
  ('ukiyo.trap.spray', ['trap-ukiyo/04'], 192, dict(mech='gust')),
  ('ukiyo.trap.whirlpool', ['trap-ukiyo/06'], 192, dict(mech='spores', note='inverts steering locally; spin in code')),
 ],
 'lilies': [
  ('lilies.trap.dragonflyswarm', ['trap-lilies/03'], 224, dict(mech='hornets', note='swarm ribbon; singles below for the sine path')),
  ('lilies.trap.dragonfly', ['trap-lilies/00','trap-lilies/02','trap-lilies/04'], 128, dict(mech='hornets', fps=12, anim='buzz')),
  ('lilies.trap.heron', ['trap-lilies/05','trap-lilies/06','trap-lilies/07'], 224, dict(mech='crow', fps=6, anim='flap')),
  ('lilies.trap.willowlash', ['trap-lilies/08'], 320, dict(mech='pendulum', anchor=[0.5,0.02])),
  ('lilies.trap.lilysink', ['trap-lilies/09'], 224, dict(mech='sapzone', note='lily-pad sink (slow + drain zone)')),
 ],
 'gilded': [
  ('gilded.trap.goldshards', ['trap-gilded/00'], 192, dict(mech='icicle')),
  ('gilded.trap.mosaiceye', ['trap-gilded/01','trap-gilded/02'], 192, dict(mech='pecker', fps=4, anim='blink', note='eye fires a beam row; iris glow = telegraph')),
  ('gilded.trap.blackbird', ['trap-gilded/03','trap-gilded/04'], 192, dict(mech='crow', fps=6, anim='flap')),
  ('gilded.trap.spiralthorn', ['trap-gilded/05','trap-gilded/06'], 288, dict(mech='pulse', fps=4, anim='pulse')),
  ('gilded.trap.shard', ['trap-gilded/07'], 160, dict(mech='embers', note='spinning shard; spin in code')),
 ],
 'lacquer': [
  ('lacquer.trap.lanternfire', ['trap-lacquer/00'], 224, dict(mech='embers')),
  ('lacquer.trap.koileap', ['trap-lacquer/01'], 224, dict(mech='cone', note='koi leaps on an arc into the target circle')),
  ('lacquer.trap.mosquitonet', ['trap-lacquer/02'], 256, dict(mech='web', note='tear = split along the weave')),
  ('lacquer.trap.egret', ['trap-lacquer/03','trap-lacquer/04'], 224, dict(mech='crow', fps=6, anim='flap')),
  ('lacquer.fx.embers', ['trap-lacquer/05'], 160, dict(mech='embers', glow=1)),
 ],
}
TRAPS['starry'] = [(i, [s.replace('starry/', 'trap-starry/') for s in src], m, e) for i, src, m, e in TRAPS['starry']]

COMMON = {
 'pickups': [
  ('icon.pickup.lantern', ['pick-a/00'], 128, dict(mech='P1', glow=1)),
  ('icon.pickup.dewbubble', ['pick-a/01'], 128, dict(mech='P2')),
  ('icon.pickup.shears', ['pick-a/03'], 128, dict(mech='P3', glow=1)),
  ('icon.pickup.prism', ['pick-a/06'], 128, dict(mech='P4', glow=1)),
  ('icon.pickup.twinseed', ['pick-a/07'], 128, dict(mech='P5', glow=1)),
  ('icon.pickup.hourglass', ['pick-a/08'], 128, dict(mech='P6', glow=1)),
  ('icon.pickup.acornrain', ['pick-b/00'], 128, dict(mech='P7', glow=1)),
  ('icon.pickup.goldenleaf', ['pick-b/01'], 128, dict(mech='P8', glow=1)),
  ('icon.pickup.leafsail', ['pick-b/02'], 128, dict(mech='P9', glow=1)),
  ('icon.pickup.sunlight', ['pick-b/03'], 96, dict(mech='pollen', glow=1, note='sunlight mote / pollen (reward gold)')),
  ('icon.pickup.ink2', ['pick-b/06'], 128, dict(mech='ink', glow=1, note='Ink x2 = paint tube')),
  ('icon.pickup.saprush', ['pick-b/07'], 128, dict(mech='rush', glow=1)),
  ('fx.dewdrop', ['pick-a/02'], 48, dict()),
 ],
 'vehicles': [
  ('vehicle.hummingbird.fly', ['veh-a/00'], 192, dict(mech='V1')),
  ('vehicle.bamboorocket.fly', ['veh-a/01'], 192, dict(mech='V2')),
  ('vehicle.dandelion.fly', ['veh-a/02'], 192, dict(mech='V4')),
  ('vehicle.mushroom.bounce', ['veh-a/03'], 192, dict(mech='V3')),
  ('vehicle.stagstrider.walk', ['veh-a/04'], 192, dict(mech='V5')),
  ('vehicle.papercrane.fly', ['veh-a/05'], 192, dict(mech='V6')),
  ('vehicle.beanstalk.ride', ['veh-b/00'], 224, dict(mech='V7')),
  ('vehicle.swiftlet.fly', ['veh-b/01'], 192, dict(mech='V8')),
  ('vehicle.morpho.fly', ['veh-b/03'], 192, dict(mech='V9')),
  ('vehicle.goldengoose.fly', ['veh-b/04'], 192, dict(mech='V10')),
  ('vehicle.kite.fly', ['veh-b/05'], 192, dict(mech='extra', note='spare ride skin (fits ukiyo/lacquer)')),
 ],
 'currency': [
  ('icon.cur.acorn', ['cur-a/00'], 96, dict()),
  ('icon.cur.gem', ['cur-a/01'], 96, dict(fill=1)),
  ('icon.cur.acornpile', ['cur-a/02'], 128, dict()),
  ('icon.cur.gempile', ['cur-a/03'], 128, dict(fill=1)),
  ('icon.cur.acornheap', ['cur-a/04'], 128, dict()),
  ('icon.cur.gemheap', ['cur-a/05'], 128, dict(fill=1)),
  ('icon.boost.ridetoken', ['cur-a/06'], 128, dict()),
  ('icon.drop.seedpod', ['cur-a/07'], 128, dict()),
  ('icon.drop.knothollow', ['cur-b/00', 'cur-b/01'], 192, dict(fps=0, anim='closed,open')),
  ('icon.drop.chest', ['cur-b/02', 'cur-b/03'], 192, dict(fps=0, anim='closed,open')),
  ('icon.boost.magnet', ['cur-b/06'], 128, dict()),
  ('icon.boost.headstart', ['cur-b/07'], 128, dict()),
 ],
 'skills': [(f'icon.skill.{n}', [f'skill-a/{i:02d}'], 128, dict(mech=f'S{i+1}')) for i, n in enumerate(
   ['sparrow', 'squirrel', 'owl', 'fox', 'snail', 'moth', 'frog', 'beetle'])],
 'rings': [(f'icon.ring.{n}', [f'rings-a/{i:02d}'], 128, dict(mech=m)) for i, n, m in [
   (0, 'deepsap', 'R1'), (1, 'quickmerge', 'R2'), (2, 'magnetroots', 'R3'), (3, 'thickbark', 'R4'), (4, 'luckyclover', 'R5'), (6, 'ridecraft', 'R6'),
   (7, 'emberheart', 'R7'), (8, 'echofork', 'R8'), (9, 'sunwise', 'R9'), (12, 'acornsense', 'R10'), (13, 'thorndancer', 'R11'), (14, 'crowfriend', 'R12'),
   (10, 'dewring', 'filler'), (11, 'graft', 'graft')]] + [
   ('icon.knot.brittlebark', ['rings-b/00'], 128, dict(mech='K1')), ('icon.knot.thirst', ['rings-b/01'], 128, dict(mech='K2')),
   ('icon.knot.restlesscrow', ['rings-b/02'], 128, dict(mech='K3')), ('icon.knot.thornfall', ['rings-b/04'], 128, dict(mech='K4')),
   ('ui.ring.card', ['rings-b/05'], 256, dict(note='ring offer card; medallion socket centre at (0.5,0.2)')),
   ('ui.ring.pip', ['rings-b/06', 'rings-b/07', 'rings-b/08'], 48, dict(fps=0, anim='I,II,III'))],
}
BOSSES = {  # (id, [idle, windup], extra fx)
 'meadow': ('meadow.boss.crowking', ['boss-meadow/00', 'boss-meadow/01'], 'The Crow King'),
 'starry': ('starry.boss.mistral', ['boss-starry/00', 'boss-starry/01'], 'The Night Mistral'),
 'fresco': ('fresco.boss.stonecherub', ['boss-fresco/00', 'boss-fresco/01'], 'The Stone Cherub'),
 'ukiyo': ('ukiyo.boss.onikite', ['boss-ukiyo/00', 'boss-ukiyo/01'], 'The Oni Kite'),
 'lilies': ('lilies.boss.heron', ['boss-lilies/00', 'boss-lilies/01'], 'The Heron Matriarch'),
 'gilded': ('gilded.boss.peacock', ['boss-gilded/00', 'boss-gilded/01'], 'The Golden Peacock'),
 'lacquer': ('lacquer.boss.carpdragon', ['boss-lacquer/00', 'boss-lacquer/01'], 'The Carp Dragon'),
}
BOSS_FX = [('gilded.boss.fx.shard', ['boss-gilded/02'], 96), ('ukiyo.boss.fx.wavearc', ['boss-ukiyo/02'], 192), ('lacquer.boss.fx.coil', ['boss-lacquer/02'], 384)]
# vine skins: (skin id, sheet, stem, leaf, flower, world-default)
VINES = [
 ('cel', 'vine-a', 0, 'vine-c/07', 2, 'meadow'), ('impasto', 'vine-a', 3, 4, 5, 'starry'), ('frescochalk', 'vine-a', 7, 8, 6, 'fresco'),
 ('sumi', 'vine-b', 0, 1, 2, 'ukiyo'), ('dabs', 'vine-b', 3, 4, 5, 'lilies'), ('goldleaf', 'vine-b', 6, 7, 8, 'gilded'),
 ('lacquer', 'vine-c', 0, 1, 2, 'lacquer'), ('watercolour', 'vine-c', 3, 4, 5, None), ('sakura', 'vine-c', 6, 7, 8, None),
 ('maple', 'vine-d', 0, 1, 2, None), ('moonsilver', 'vine-d', 3, 4, 5, None), ('chudau', 'vine-d', 6, 7, 8, None),
]
FILL = {'vine-a/01', 'vine-b/04', 'vine-c/04', 'vine-c/07', 'vine-a/08'}
UI = [  # (id, src, note)
 ('ui.frame.meadow', 'ui-frames-a/00'), ('ui.frame.starry', 'ui-frames-a/01'), ('ui.frame.fresco', 'ui-frames-a/02'), ('ui.frame.ukiyo', 'ui-frames-a/03'),
 ('ui.frame.lilies', 'ui-frames-b/00'), ('ui.frame.gilded', 'ui-frames-b/01'), ('ui.frame.lacquer', 'ui-frames-b/02'), ('ui.frame.default', 'ui-frames-b/03'),
 ('ui.button.primary', 'ui-kit/00'), ('ui.button.primary.pressed', 'ui-kit/01'), ('ui.panel.parchment', 'ui-kit/02'), ('ui.button.secondary', 'ui-kit/03'),
 ('ui.button.close', 'ui-kit/04'), ('ui.bar.track', 'ui-kit/05'), ('ui.plaque', 'ui-kit/06'), ('ui.locked.rope', 'ui-kit/07'),
]
