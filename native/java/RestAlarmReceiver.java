package pt.pedrogoncalves.gymtrack;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Recebe o alarme do temporizador de descanso (AlarmManager) e toca o som de alarme do telemóvel
 * durante 8 segundos, com vibração. Funciona com o ecrã bloqueado ou com a app em segundo plano.
 * RestAlarmPlugin.stop()/cancel() param o som mais cedo.
 */
public class RestAlarmReceiver extends BroadcastReceiver {

    private static final long RING_MS = 8000;
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static Ringtone ringtone;
    private static Vibrator vibrator;
    private static PendingResult pending;

    private static final Runnable AUTO_STOP = new Runnable() {
        @Override
        public void run() {
            stopRinging();
        }
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        stopRinging();
        Context app = context.getApplicationContext();
        pending = goAsync();   // mantém o processo vivo enquanto o alarme toca

        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) {
                uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            ringtone = RingtoneManager.getRingtone(app, uri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                if (Build.VERSION.SDK_INT >= 28) {
                    ringtone.setLooping(true);
                }
                ringtone.play();
            }
        } catch (Exception ignored) {
            // sem som: a vibração e o ecrã ainda avisam
        }

        try {
            vibrator = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null) {
                long[] pattern = {0, 500, 250, 500, 250, 500, 250, 500};
                if (Build.VERSION.SDK_INT >= 26) {
                    // Com o ecrã bloqueado a app está em segundo plano, e o Android só deixa uma app
                    // em segundo plano vibrar se a vibração for declarada como alarme, toque ou
                    // notificação. Sem estes atributos só vibrava com o telemóvel desbloqueado.
                    AudioAttributes alarmAttrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1), alarmAttrs);
                } else {
                    vibrator.vibrate(pattern, -1);
                }
            }
        } catch (Exception ignored) {
            // sem vibração
        }

        HANDLER.postDelayed(AUTO_STOP, RING_MS);
    }

    /** Para o som e a vibração (se estiverem a tocar) e liberta o recetor. */
    public static synchronized void stopRinging() {
        HANDLER.removeCallbacks(AUTO_STOP);
        try {
            if (ringtone != null) {
                ringtone.stop();
            }
        } catch (Exception ignored) {
            // já parado
        }
        ringtone = null;
        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Exception ignored) {
            // já parado
        }
        vibrator = null;
        if (pending != null) {
            try {
                pending.finish();
            } catch (Exception ignored) {
                // já terminado
            }
            pending = null;
        }
    }
}
