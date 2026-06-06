"""Python ML microservice — serves trained scikit-learn models."""
import os
import re
import pickle
import numpy as np
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print('[TF] TensorFlow not installed — LSTM endpoints disabled')

# OCR imports — graceful fallback if not installed
try:
    import pytesseract
    from PIL import Image, ImageFilter, ImageEnhance
    import cv2
    # Windows: set Tesseract path if not on system PATH
    import platform
    if platform.system() == 'Windows':
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print('[OCR] pytesseract/Pillow/opencv not installed — OCR endpoint disabled')

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, 'model.pkl')
LSTM_MODEL_PATH = os.path.join(BASE_DIR, 'lstm_model.keras')
LSTM_SCALER_PATH = os.path.join(BASE_DIR, 'lstm_scaler.pkl')

app = Flask(__name__)
CORS(app)

_bundle = None

def _load():
    global _bundle
    if _bundle is None:
        if not os.path.exists(MODEL_PATH):
            return None
        with open(MODEL_PATH, 'rb') as f:
            _bundle = pickle.load(f)
        # Load LSTM artifacts if available
        if os.path.exists(LSTM_MODEL_PATH):
            try:
                if TF_AVAILABLE:
                    _bundle['lstm_model'] = tf.keras.models.load_model(LSTM_MODEL_PATH)
            except Exception as e:
                print('Failed to load LSTM model:', e)
        if os.path.exists(LSTM_SCALER_PATH):
            try:
                with open(LSTM_SCALER_PATH, 'rb') as f:
                    lstm_meta = pickle.load(f)
                    _bundle['lstm_scaler'] = lstm_meta['scaler']
                    _bundle['lstm_seq_len'] = lstm_meta.get('sequence_length', 24)
                    _bundle['lstm_features'] = lstm_meta.get('feature_cols', [])
                    _bundle['lstm_metrics'] = lstm_meta.get('lstm_metrics', {})
            except Exception as e:
                print('Failed to load LSTM scaler:', e)
    return _bundle

def _scale_input(hour, dayofweek, month, sub1, sub2, sub3):
    bundle = _load()
    X = np.array([[hour, dayofweek, month, sub1, sub2, sub3]])
    return bundle['scaler'].transform(X)

def _build_sequence(hour, dayofweek, month, sub1, sub2, sub3, seq_len=24):
    """Build a synthetic 24-hour lookback sequence for LSTM prediction."""
    bundle = _load()
    scaler = bundle['lstm_scaler']
    features = bundle.get('lstm_features', ['Global_active_power', 'Sub_metering_1',
                                            'Sub_metering_2', 'Sub_metering_3',
                                            'hour', 'dayofweek', 'month'])

    def base_kw(h):
        if 0 <= h < 6:
            return 0.45
        elif 6 <= h < 9:
            return 1.4
        elif 9 <= h < 12:
            return 1.2
        elif 12 <= h < 14:
            return 1.1
        elif 14 <= h < 18:
            return 1.0
        elif 18 <= h < 22:
            return 1.9
        else:
            return 1.1

    seq = []
    for i in range(seq_len):
        h = (hour - seq_len + 1 + i) % 24
        row = {
            'Global_active_power': base_kw(h),
            'Sub_metering_1': sub1,
            'Sub_metering_2': sub2,
            'Sub_metering_3': sub3,
            'hour': h,
            'dayofweek': dayofweek,
            'month': month
        }
        seq.append([row[f] for f in features])
    seq_arr = np.array(seq, dtype=np.float32)
    return scaler.transform(seq_arr)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'ML Microservice'})

@app.route('/predict/lr', methods=['GET'])
def predict_lr():
    bundle = _load()
    if bundle is None:
        return jsonify({'error': 'Model not found. Run train.py'}), 500
    hour = int(request.args.get('hour', datetime.now().hour))
    dayofweek = int(request.args.get('dayofweek', datetime.now().weekday()))
    month = int(request.args.get('month', datetime.now().month))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    X_s = _scale_input(hour, dayofweek, month, sub1, sub2, sub3)
    pred = float(bundle['model'].predict(X_s)[0])
    return jsonify({
        'algorithm': 'Linear Regression',
        'input': {'hour': hour, 'dayofweek': dayofweek, 'month': month},
        'predicted_kw': round(max(0, pred), 3),
        'metrics': bundle.get('lr_metrics', {})
    })

@app.route('/predict/dt', methods=['GET'])
def predict_dt():
    bundle = _load()
    if bundle is None or 'dt_model' not in bundle:
        return jsonify({'error': 'Decision Tree not found. Run train.py'}), 500
    hour = int(request.args.get('hour', datetime.now().hour))
    dayofweek = int(request.args.get('dayofweek', datetime.now().weekday()))
    month = int(request.args.get('month', datetime.now().month))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    X_s = _scale_input(hour, dayofweek, month, sub1, sub2, sub3)
    pred = float(bundle['dt_model'].predict(X_s)[0])
    return jsonify({
        'algorithm': 'Decision Tree',
        'input': {'hour': hour, 'dayofweek': dayofweek, 'month': month},
        'predicted_kw': round(max(0, pred), 3),
        'metrics': bundle.get('dt_metrics', {})
    })

@app.route('/predict/rf', methods=['GET'])
def predict_rf():
    bundle = _load()
    if bundle is None or 'rf_model' not in bundle:
        return jsonify({'error': 'Random Forest not found. Run train.py'}), 500
    hour = int(request.args.get('hour', datetime.now().hour))
    dayofweek = int(request.args.get('dayofweek', datetime.now().weekday()))
    month = int(request.args.get('month', datetime.now().month))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    X_s = _scale_input(hour, dayofweek, month, sub1, sub2, sub3)
    pred = float(bundle['rf_model'].predict(X_s)[0])
    return jsonify({
        'algorithm': 'Random Forest',
        'input': {'hour': hour, 'dayofweek': dayofweek, 'month': month},
        'predicted_kw': round(max(0, pred), 3),
        'metrics': bundle.get('rf_metrics', {})
    })

@app.route('/predict/lstm', methods=['GET'])
def predict_lstm():
    bundle = _load()
    if bundle is None or 'lstm_model' not in bundle:
        return jsonify({'error': 'LSTM model not found. Run train_lstm.py'}), 500
    hour = int(request.args.get('hour', datetime.now().hour))
    dayofweek = int(request.args.get('dayofweek', datetime.now().weekday()))
    month = int(request.args.get('month', datetime.now().month))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    seq = _build_sequence(hour, dayofweek, month, sub1, sub2, sub3,
                          bundle.get('lstm_seq_len', 24))
    seq = np.expand_dims(seq, axis=0)
    pred = float(bundle['lstm_model'].predict(seq, verbose=0)[0][0])
    return jsonify({
        'algorithm': 'LSTM Neural Network',
        'input': {'hour': hour, 'dayofweek': dayofweek, 'month': month},
        'predicted_kw': round(max(0, pred), 3),
        'metrics': bundle.get('lstm_metrics', {})
    })

@app.route('/predict/compare', methods=['GET'])
def predict_compare():
    bundle = _load()
    if bundle is None:
        return jsonify({'error': 'Models not found. Run train.py'}), 500
    hour = int(request.args.get('hour', datetime.now().hour))
    dayofweek = int(request.args.get('dayofweek', datetime.now().weekday()))
    month = int(request.args.get('month', datetime.now().month))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    X_s = _scale_input(hour, dayofweek, month, sub1, sub2, sub3)
    lr_p = round(max(0, float(bundle['model'].predict(X_s)[0])), 3)
    dt_p = round(max(0, float(bundle['dt_model'].predict(X_s)[0])), 3)
    rf_p = round(max(0, float(bundle['rf_model'].predict(X_s)[0])), 3)
    lstm_p = None
    if 'lstm_model' in bundle:
        seq = _build_sequence(hour, dayofweek, month, sub1, sub2, sub3,
                              bundle.get('lstm_seq_len', 24))
        seq = np.expand_dims(seq, axis=0)
        lstm_p = round(max(0, float(bundle['lstm_model'].predict(seq, verbose=0)[0][0])), 3)
    preds = {
        'linear_regression': {'kw': lr_p, 'metrics': bundle.get('lr_metrics', {})},
        'decision_tree': {'kw': dt_p, 'metrics': bundle.get('dt_metrics', {})},
        'random_forest': {'kw': rf_p, 'metrics': bundle.get('rf_metrics', {})}
    }
    if lstm_p is not None:
        preds['lstm'] = {'kw': lstm_p, 'metrics': bundle.get('lstm_metrics', {})}
    return jsonify({
        'input': {'hour': hour, 'dayofweek': dayofweek, 'month': month, 'sub1': sub1, 'sub2': sub2, 'sub3': sub3},
        'predictions': preds,
        'best_model': 'lstm' if lstm_p is not None else 'random_forest'
    })

@app.route('/forecast', methods=['GET'])
def forecast():
    bundle = _load()
    if bundle is None:
        return jsonify({'error': 'Models not found. Run train.py'}), 500
    model_type = request.args.get('model', 'rf')
    use_lstm = model_type == 'lstm' and 'lstm_model' in bundle
    avg_sub = [1.122, 1.299, 6.458]
    result = []
    base = datetime.now()
    for i in range(7):
        day = base + timedelta(days=i)
        daily_kwh = 0
        
        # Batching hourly predictions for the day to improve performance
        if use_lstm:
            seqs = []
            for h in range(24):
                seq = _build_sequence(h, day.weekday(), day.month, avg_sub[0], avg_sub[1], avg_sub[2], bundle.get('lstm_seq_len', 24))
                seqs.append(seq)
            seqs = np.array(seqs)
            preds = bundle['lstm_model'].predict(seqs, verbose=0).flatten()
            for h in range(24):
                kw = max(0, float(preds[h]))
                daily_kwh += kw / 60
        else:
            model_key = {'lr': 'model', 'dt': 'dt_model', 'rf': 'rf_model'}.get(model_type, 'rf_model')
            model = bundle[model_key]
            scaler = bundle['scaler']
            X_batch = []
            for h in range(24):
                X_batch.append([h, day.weekday(), day.month] + avg_sub)
            X_batch = np.array(X_batch)
            preds = model.predict(scaler.transform(X_batch))
            for h in range(24):
                kw = max(0, float(preds[h]))
                daily_kwh += kw / 60
                
        result.append({
            'date': day.strftime('%Y-%m-%d'),
            'day': day.strftime('%A'),
            'predicted_kwh': round(daily_kwh, 2),
            'predicted_cost': round(daily_kwh * 0.15, 2),
            'co2_kg': round(daily_kwh * 0.233, 2)
        })
    return jsonify({'model_used': model_type.upper(), 'forecast': result})

@app.route('/metrics', methods=['GET'])
def metrics():
    bundle = _load()
    if bundle is None:
        return jsonify({'error': 'Models not found. Run train.py'}), 500
    payload = {
        'linear_regression': bundle.get('lr_metrics', {}),
        'decision_tree': bundle.get('dt_metrics', {}),
        'random_forest': bundle.get('rf_metrics', {}),
        'kmeans': bundle.get('km_metrics', {}),
        'isolation_forest': bundle.get('iso_metrics', {})
    }
    if 'lstm_metrics' in bundle:
        payload['lstm'] = bundle.get('lstm_metrics', {})
    return jsonify(payload)

@app.route('/classify', methods=['GET'])
def classify():
    bundle = _load()
    if bundle is None or 'kmeans' not in bundle:
        return jsonify({'error': 'K-Means not found. Run train.py'}), 500
    power_kw = float(request.args.get('power_kw', 1.0))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    hour = int(request.args.get('hour', datetime.now().hour))
    X = np.array([[power_kw, sub1, sub2, sub3, hour]])
    X_s = bundle['km_scaler'].transform(X)
    cluster_id = int(bundle['kmeans'].predict(X_s)[0])
    label = bundle['km_label_map'][cluster_id]
    return jsonify({
        'algorithm': 'K-Means Clustering',
        'power_kw': power_kw,
        'cluster': label,
        'interpretation': {
            'Low': 'Idle/night usage — below average consumption',
            'Medium': 'Normal household activity',
            'High': 'Peak usage — consider reducing load'
        }[label],
        'metrics': bundle.get('km_metrics', {})
    })

@app.route('/clusters', methods=['GET'])
def cluster_summary():
    bundle = _load()
    if bundle is None or 'kmeans' not in bundle:
        return jsonify({'error': 'K-Means not found.'}), 500
    km_scaler = bundle['km_scaler']
    kmeans = bundle['kmeans']
    label_map = bundle['km_label_map']
    features = bundle['km_features']
    centers_raw = km_scaler.inverse_transform(kmeans.cluster_centers_)
    centers = [
        {'cluster_id': i, 'label': label_map[i],
         'center': {f: round(float(v), 3) for f, v in zip(features, row)}}
        for i, row in enumerate(centers_raw)
    ]
    return jsonify({
        'algorithm': 'K-Means Clustering',
        'k': 3, 'labels': ['Low', 'Medium', 'High'],
        'distribution': {'Low': 64.4, 'Medium': 32.6, 'High': 3.1},
        'cluster_centers': centers,
        'metrics': bundle.get('km_metrics', {})
    })

@app.route('/anomaly', methods=['GET'])
def anomaly():
    bundle = _load()
    if bundle is None or 'iso_forest' not in bundle:
        return jsonify({'error': 'Isolation Forest not found. Run train.py'}), 500
    power_kw = float(request.args.get('power_kw', 1.0))
    sub1 = float(request.args.get('sub1', 0))
    sub2 = float(request.args.get('sub2', 0))
    sub3 = float(request.args.get('sub3', 0))
    X = np.array([[power_kw, sub1, sub2, sub3]])
    X_s = bundle['iso_scaler'].transform(X)
    result = int(bundle['iso_forest'].predict(X_s)[0])
    score = float(bundle['iso_forest'].score_samples(X_s)[0])
    is_anomaly = result == -1
    return jsonify({
        'algorithm': 'Isolation Forest',
        'power_kw': power_kw,
        'is_anomaly': is_anomaly,
        'anomaly_score': round(score, 4),
        'status': 'ANOMALY DETECTED' if is_anomaly else 'Normal',
        'message': 'Unusual power consumption detected!' if is_anomaly
                   else 'Power consumption is within normal range.',
        'metrics': bundle.get('iso_metrics', {})
    })

@app.route('/ocr', methods=['POST'])
def ocr_bill():
    """
    Extract energy bill data from an uploaded image.
    Accepts multipart/form-data with field 'image'.
    Returns structured JSON: { units, cost, date, raw_text, confidence }
    """
    if not OCR_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'OCR libraries not installed.',
            'install_hint': 'pip install pytesseract Pillow opencv-python-headless  |  Then install Tesseract from: https://github.com/UB-Mannheim/tesseract/wiki'
        }), 503

    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image file provided. Use field name "image"'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Empty filename'}), 400

    allowed_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in allowed_exts:
        return jsonify({'success': False, 'error': f'Unsupported format. Allowed: {", ".join(allowed_exts)}'}), 400

    try:
        img = Image.open(file.stream).convert('RGB')
        w, h = img.size

        # Scale up small images for better OCR accuracy
        if w < 1200:
            scale = 1200 / w
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray   = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

        # Try multiple PSM modes and preprocessing combinations
        # Pick the result that extracts the most useful fields
        candidates = []

        configs = [
            '--oem 3 --psm 3',   # Fully automatic page segmentation
            '--oem 3 --psm 4',   # Single column of text
            '--oem 3 --psm 11',  # Sparse text
            '--oem 3 --psm 6',   # Uniform block of text
        ]

        # Preprocessing variants
        _, thresh_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        thresh_adapt   = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                               cv2.THRESH_BINARY, 11, 2)
        denoised       = cv2.fastNlMeansDenoising(gray, h=10)
        _, thresh_den  = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        images_to_try = [
            Image.fromarray(thresh_otsu),
            img,                          # original colour (often best for digital bills)
            Image.fromarray(thresh_adapt),
            Image.fromarray(thresh_den),
        ]

        best_text   = ''
        best_score  = -1

        for pil_img in images_to_try:
            for cfg in configs:
                try:
                    t = pytesseract.image_to_string(pil_img, config=cfg)
                    parsed = _parse_bill_text(t)
                    score  = sum(1 for v in [parsed['units'], parsed['cost'], parsed['date']] if v is not None)
                    if score > best_score:
                        best_score = score
                        best_text  = t
                    if best_score == 3:
                        break   # all three fields found — stop early
                except Exception:
                    continue
            if best_score == 3:
                break

        raw_text  = best_text
        extracted = _parse_bill_text(raw_text)
        extracted['raw_text'] = raw_text.strip()
        extracted['success']  = True
        return jsonify(extracted)

    except pytesseract.TesseractNotFoundError:
        return jsonify({
            'success': False,
            'error': 'Tesseract OCR engine not found. Install it first.',
            'install_hint': 'Windows: download from https://github.com/UB-Mannheim/tesseract/wiki  |  Linux: sudo apt install tesseract-ocr'
        }), 503
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _parse_bill_text(text):
    """
    Extract units consumed, total cost, billing date, and consumption history
    from OCR text. Handles TSSPDCL, BESCOM, MSEDCL, TNEB and other Indian formats.
    """
    result = {
        'units': None, 'cost': None, 'date': None,
        'confidence': 'low', 'history': []
    }
    upper = text.upper()

    # ── Units consumed ────────────────────────────────────────────────
    unit_patterns = [
        # Direct label match (most reliable)
        r"UNITS\s*CONSUMED\s*[:\-]?\s*(\d{2,6})",
        r"ENERGY\s*CONSUMED\s*[:\-]?\s*(\d{2,6})",
        r"KWH\s*CONSUMED\s*[:\-]?\s*(\d{2,6})",
        r"NET\s*CONSUMPTION\s*[:\-]?\s*(\d{2,6})",
        r"TOTAL\s*UNITS?\s*[:\-]?\s*(\d{2,6})",
        r"CONSUMPTION\s*[:\-]?\s*(\d{2,6})",
        # Reading difference
        r"PRESENT\s*READING\s*[:\-]?\s*(\d{4,6})[^\d]+PREVIOUS\s*READING\s*[:\-]?\s*(\d{4,6})",
        r"CLOSING\s*READING\s*[:\-]?\s*(\d{4,6})[^\d]+OPENING\s*READING\s*[:\-]?\s*(\d{4,6})",
        # Number followed by kWh/units
        r"\b(\d{2,5})\s*(?:KWH|UNITS?)\b",
    ]

    candidates = []
    for pat in unit_patterns:
        for m in re.finditer(pat, upper):
            try:
                if m.lastindex == 2:
                    diff = float(m.group(1)) - float(m.group(2))
                    if 5 <= diff <= 9999:
                        candidates.append(diff)
                else:
                    val = float(m.group(1))
                    if 5 <= val <= 9999:
                        candidates.append(val)
            except Exception:
                pass

    if candidates:
        from collections import Counter
        freq = Counter(candidates)
        result['units'] = freq.most_common(1)[0][0]

    # ── Total cost ────────────────────────────────────────────────────
    cost_patterns = [
        # Most specific first — "TOTAL AMOUNT PAYABLE" or "TOTAL AMOUNT :"
        r"TOTAL\s*AMOUNT\s*(?:PAYABLE|DUE)?\s*[:\+\-]?\s*[%₹RS\.]*\s*([\d,]+\.?\d{0,2})",
        r"AMOUNT\s*(?:PAYABLE|DUE)\s*[:\-]?\s*[%₹RS\.]*\s*([\d,]+\.?\d{0,2})",
        r"NET\s*AMOUNT\s*[:\-]?\s*[%₹RS\.]*\s*([\d,]+\.?\d{0,2})",
        r"BILL\s*AMOUNT\s*[:\-]?\s*[%₹RS\.]*\s*([\d,]+\.?\d{0,2})",
        r"GRAND\s*TOTAL\s*[:\-]?\s*[%₹RS\.]*\s*([\d,]+\.?\d{0,2})",
    ]
    cost_candidates = []
    for pat in cost_patterns:
        for m in re.finditer(pat, upper):
            try:
                val_str = m.group(1).replace(',', '')
                val = float(val_str)
                # Must be a realistic bill amount: between 50 and 1,00,000
                if 50 <= val <= 100000:
                    cost_candidates.append(val)
            except Exception:
                pass
    if cost_candidates:
        result['cost'] = max(cost_candidates)

    # ── Billing date ──────────────────────────────────────────────────
    date_patterns = [
        r"BILL\s*DATE\s*[:\-©]?\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})",
        r"BILL\s*MONTH\s*[:\-]?\s*([A-Z]{3,9}[-\s]\d{2,4})",
        r"ISSUE\s*DATE\s*[:\-]?\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})",
        r"(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{4})",
        r"(\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2})",
    ]
    MONTH_MAP = {'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,
                 'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}
    for pat in date_patterns:
        m = re.search(pat, upper)
        if m:
            raw = m.group(1).strip()
            # Month-year format e.g. "APR-2024"
            mm = re.match(r'([A-Z]{3,9})[-\s](\d{2,4})', raw)
            if mm:
                mon = mm.group(1)[:3]
                yr  = mm.group(2)
                if len(yr) == 2: yr = '20' + yr
                if mon in MONTH_MAP:
                    result['date'] = f"{yr}-{MONTH_MAP[mon]:02d}-01"
                    break
            # Numeric formats
            for fmt in ('%d-%m-%Y','%d/%m/%Y','%d.%m.%Y',
                        '%Y-%m-%d','%Y/%m/%d',
                        '%d-%m-%y','%d/%m/%y'):
                try:
                    result['date'] = datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
                    break
                except ValueError:
                    continue
            if result['date']:
                break

    # ── Consumption history (for trend prediction) ────────────────────
    # Match patterns like "Oct-23 287" or "APR-24 333"
    hist_pattern = r'([A-Z]{3}[-\s]\d{2})\s+(\d{2,4})'
    for m in re.finditer(hist_pattern, upper):
        try:
            mon_yr = m.group(1).replace(' ', '-')
            units  = int(m.group(2))
            if 5 <= units <= 9999:
                result['history'].append({'period': mon_yr, 'units': units})
        except Exception:
            pass

    # ── Confidence ────────────────────────────────────────────────────
    found = sum(1 for v in [result['units'], result['cost'], result['date']] if v is not None)
    result['confidence'] = ['low', 'medium', 'medium', 'high'][found]

    return result


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f'ML Microservice — http://0.0.0.0:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
