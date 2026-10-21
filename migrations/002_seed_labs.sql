insert into equipment (name) values
  ('Microscope'),
  ('Oscilloscope'),
  ('Soldering station'),
  ('3D printer');

insert into labs (name, location, capacity) values
  ('Biology Lab 1', 'Building 2, floor 1', 20),
  ('Electronics Lab', 'Building 3, floor 2', 12),
  ('Makerspace', 'Building 1, basement', 8);

insert into lab_equipment (lab_id, equipment_id)
select l.id, e.id
from labs l
join equipment e on
  (l.name = 'Biology Lab 1' and e.name = 'Microscope')
  or (l.name = 'Electronics Lab' and e.name in ('Oscilloscope', 'Soldering station'))
  or (l.name = 'Makerspace' and e.name = '3D printer');
