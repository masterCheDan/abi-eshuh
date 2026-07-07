"""
将 SchaleDB raids.json 精简为排轴工具所需的 Boss 最小数据集
"""
import json

with open('data/raids.json', encoding='utf-8') as f:
    raw = json.load(f)

bosses = {}
raid = raw.get('Raid', [])

for entry in raid:
    boss = {
        'Id': entry['Id'],
        'PathName': entry['PathName'],
        'Name': entry.get('Name', entry['PathName']),
        'ArmorType': entry['ArmorType'],
        'BulletType': entry['BulletType'],
        'BulletTypeInsane': entry.get('BulletTypeInsane', entry['BulletType']),
        'Terrain': entry['Terrain'],
        'BattleDuration': entry.get('BattleDuration', [180] * 8),
        'MaxDifficulty': entry.get('MaxDifficulty', [6] * 3),
    }
    bosses[str(entry['Id'])] = boss

output_path = 'src/data/bosses.min.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(bosses, f, ensure_ascii=False, separators=(',', ':'))

import os
new_size = os.path.getsize(output_path)
print(f'Boss 数量: {len(bosses)}')
print(f'精简大小: {new_size} 字节')
print(f'输出: {output_path}')
