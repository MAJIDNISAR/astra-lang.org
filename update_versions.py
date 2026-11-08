
import os
import glob

def update_files():
    html_files = glob.glob('/Users/majidnisar/Developer/astra-lang.org/*.html')
    for file_path in html_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content.replace('v0.13.2-alpha', 'v0.13.4-alpha')
        new_content = new_content.replace('astra-v0.13.2-alpha', 'astra-v0.13.4-alpha')
        
        if 'benchmarks.html' in file_path:
            new_content = new_content.replace('831 passed', '847 passed')
        if 'vision.html' in file_path:
            new_content = new_content.replace('831 tests', '847 tests')
            
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated {file_path}')

if __name__ == '__main__':
    update_files()
