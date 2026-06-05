"""Train an LSTM model for time-series energy forecasting."""
import os
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import tensorflow as tf
from tensorflow import keras

BASE_DIR = os.path.dirname(__file__)
CSV_PATH = os.path.join(BASE_DIR, 'energy.csv')
MODEL_PATH = os.path.join(BASE_DIR, 'lstm_model.keras')
SCALER_PATH = os.path.join(BASE_DIR, 'lstm_scaler.pkl')

SEQUENCE_LENGTH = 24  # past 24 hours
FEATURE_COLS = ['Global_active_power', 'Sub_metering_1', 'Sub_metering_2',
                'Sub_metering_3', 'hour', 'dayofweek', 'month']
TARGET_COL = 'Global_active_power'


def create_sequences(data, seq_len):
    """Create (X, y) sequences from a 2D numpy array."""
    X, y = [], []
    for i in range(len(data) - seq_len):
        X.append(data[i:i + seq_len])
        y.append(data[i + seq_len][0])  # first column is target
    return np.array(X), np.array(y)


def train_lstm():
    if not os.path.exists(CSV_PATH):
        print('energy.csv not found. Run generate_data.py first.')
        return

    df = pd.read_csv(CSV_PATH)
    df['DateTime'] = pd.to_datetime(df['Date'] + ' ' + df['Time'])
    df['hour'] = df['DateTime'].dt.hour
    df['dayofweek'] = df['DateTime'].dt.dayofweek
    df['month'] = df['DateTime'].dt.month

    # Ensure correct column order
    data = df[FEATURE_COLS].values.astype(np.float32)

    # Scale data
    scaler = MinMaxScaler()
    data_scaled = scaler.fit_transform(data)

    # Build sequences
    X, y = create_sequences(data_scaled, SEQUENCE_LENGTH)

    # Train/test split (time-based, last 20%)
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Build LSTM model
    model = keras.Sequential([
        keras.layers.LSTM(64, return_sequences=True,
                          input_shape=(SEQUENCE_LENGTH, len(FEATURE_COLS))),
        keras.layers.Dropout(0.2),
        keras.layers.LSTM(32),
        keras.layers.Dropout(0.2),
        keras.layers.Dense(16, activation='relu'),
        keras.layers.Dense(1)
    ])

    model.compile(optimizer='adam', loss='mse', metrics=['mae'])

    # Early stopping
    early_stop = keras.callbacks.EarlyStopping(
        monitor='val_loss', patience=10, restore_best_weights=True)

    # Train
    history = model.fit(
        X_train, y_train,
        validation_split=0.1,
        epochs=100,
        batch_size=32,
        callbacks=[early_stop],
        verbose=1
    )

    # Evaluate
    y_pred = model.predict(X_test, verbose=0).flatten()

    # Inverse-transform predictions and true values
    # To inverse transform target only, we pad with zeros for other features
    def inverse_target(scaled_target):
        """Inverse transform the target column only."""
        dummy = np.zeros((len(scaled_target), len(FEATURE_COLS)))
        dummy[:, 0] = scaled_target
        inv = scaler.inverse_transform(dummy)
        return inv[:, 0]

    y_test_inv = inverse_target(y_test)
    y_pred_inv = inverse_target(y_pred)

    metrics = {
        'mae': round(mean_absolute_error(y_test_inv, y_pred_inv), 3),
        'rmse': round(np.sqrt(mean_squared_error(y_test_inv, y_pred_inv)), 3),
        'r2': round(r2_score(y_test_inv, y_pred_inv), 3)
    }

    # Save model and scaler
    model.save(MODEL_PATH)
    with open(SCALER_PATH, 'wb') as f:
        pickle.dump({'scaler': scaler, 'feature_cols': FEATURE_COLS,
                     'sequence_length': SEQUENCE_LENGTH,
                     'lstm_metrics': metrics}, f)

    print('LSTM model saved to', MODEL_PATH)
    print('LSTM scaler saved to', SCALER_PATH)
    print('LSTM Metrics:', metrics)


if __name__ == '__main__':
    train_lstm()
