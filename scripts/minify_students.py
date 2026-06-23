"""将 SchaleDB 原始学生数据精简为排轴工具所需的最小数据集"""

import json

# 加载原始数据
with open('data/students.json', encoding='utf-8') as f:
    raw = json.load(f)

minified = {}

for sid, s in raw.items():
    skills = s.get('Skills', {})
    weapon = s.get('Weapon', {})
    favor_types = s.get('FavorStatType', [])
    favor_values = s.get('FavorStatValue', [])

    def clean_effects(effects):
        """只保留需要的 Effect 字段"""
        if not effects:
            return []
        cleaned = []
        for ef in effects:
            item = {'Type': ef.get('Type')}
            if 'ApplyFrame' in ef:
                item['ApplyFrame'] = ef['ApplyFrame']
            if 'Duration' in ef:
                item['Duration'] = ef['Duration']
            if 'Scale' in ef:
                item['Scale'] = ef['Scale']
            if 'Hits' in ef:
                item['Hits'] = ef['Hits']
            if 'Target' in ef:
                item['Target'] = ef['Target']
            if 'Stat' in ef:
                item['Stat'] = ef['Stat']
            if 'Value' in ef:
                item['Value'] = ef['Value']
            if 'Period' in ef:
                item['Period'] = ef['Period']
            if 'SummonId' in ef:
                item['SummonId'] = ef['SummonId']
            if 'Chance' in ef:
                item['Chance'] = ef['Chance']
            if 'Condition' in ef:
                item['Condition'] = ef['Condition']
            if 'StackLabel' in ef:
                item['StackLabel'] = ef['StackLabel']
            if 'StackSame' in ef:
                item['StackSame'] = ef['StackSame']
            cleaned.append(item)
        return cleaned

    def clean_ex(skill):
        if not skill:
            return None
        return {
            'Name': skill.get('Name', ''),
            'Desc': skill.get('Desc', ''),
            'Parameters': skill.get('Parameters', []),
            'Cost': skill.get('Cost', []),
            'Duration': skill.get('Duration', 0),
            'Range': skill.get('Range', 0),
            'Radius': skill.get('Radius'),
            'Icon': skill.get('Icon', ''),
            'Effects': clean_effects(skill.get('Effects', [])),
        }

    def clean_public(skill):
        if not skill:
            return None
        return {
            'Name': skill.get('Name', ''),
            'Desc': skill.get('Desc', ''),
            'Parameters': skill.get('Parameters', []),
            'Duration': skill.get('Duration', 0),
            'Range': skill.get('Range', 0),
            'Radius': skill.get('Radius'),
            'Icon': skill.get('Icon', ''),
            'Effects': clean_effects(skill.get('Effects', [])),
        }

    def clean_passive(skill):
        if not skill:
            return None
        return {
            'Name': skill.get('Name', ''),
            'Desc': skill.get('Desc', ''),
            'Parameters': skill.get('Parameters', []),
            'Icon': skill.get('Icon', ''),
            'Effects': clean_effects(skill.get('Effects', [])),
        }

    def clean_normal(skill):
        if not skill:
            return None
        result = {'Frames': skill.get('Frames', {})}
        if 'Radius' in skill:
            result['Radius'] = skill['Radius']
        return result

    # 构建好感度加成
    favor_stats = []
    for i, t in enumerate(favor_types):
        if i < len(favor_values):
            favor_stats.append({
                't': t,
                'v': favor_values[i]
            })

    minified[sid] = {
        'Id': s['Id'],
        'Name': s['Name'],
        'Icon': s.get('Icon', ''),
        'School': s.get('School', ''),
        'SquadType': s.get('SquadType', ''),
        'TacticRole': s.get('TacticRole', ''),
        'Position': s.get('Position', ''),
        'StarGrade': s.get('StarGrade', 1),
        'BulletType': s.get('BulletType', ''),
        'ArmorType': s.get('ArmorType', ''),
        'WeaponType': s.get('WeaponType', ''),
        'Cover': s.get('Cover', False),
        'Street': s.get('StreetBattleAdaptation', 0),
        'Outdoor': s.get('OutdoorBattleAdaptation', 0),
        'Indoor': s.get('IndoorBattleAdaptation', 0),
        'ATK': s.get('AttackPower100', 0),
        'HP': s.get('MaxHP100', 0),
        'DEF': s.get('DefensePower100', 0),
        'HEAL': s.get('HealPower100', 0),
        'Dodge': s.get('DodgePoint', 0),
        'Accuracy': s.get('AccuracyPoint', 0),
        'Crit': s.get('CriticalPoint', 0),
        'CritDMG': s.get('CriticalDamageRate', 0),
        'Ammo': s.get('AmmoCount', 0),
        'AmmoCost': s.get('AmmoCost', 0),
        'Range': s.get('Range', 0),
        'Sight': s.get('SightPoint', 0),
        'Regen': s.get('RegenCost', 0),
        'Favor': favor_stats,
        'Skills': {
            'N': clean_normal(skills.get('Normal')),
            'E': clean_ex(skills.get('Ex')),
            'P': clean_public(skills.get('Public')),
            'G': clean_public(skills.get('GearPublic')),
            'PS': clean_passive(skills.get('Passive')),
            'WP': clean_passive(skills.get('WeaponPassive')),
            'EP': clean_passive(skills.get('ExtraPassive')),
        },
        'Weapon': {
            'ATK': weapon.get('AttackPower100', 0),
            'HP': weapon.get('MaxHP100', 0),
            'HEAL': weapon.get('HealPower100', 0),
        },
        'HasGear': any(s.get('Gear', {}).get('Released', [False])),
    }

# 输出
output_path = 'src/data/students.min.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(minified, f, ensure_ascii=False, separators=(',', ':'))

# 统计
import os
orig_size = os.path.getsize('data/students.json')
new_size = os.path.getsize(output_path)
print(f'原始大小: {orig_size / 1024 / 1024:.2f} MB')
print(f'精简大小: {new_size / 1024 / 1024:.2f} MB')
print(f'压缩比: {new_size / orig_size * 100:.1f}%')
print(f'学生数量: {len(minified)}')
