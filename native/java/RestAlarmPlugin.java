package pt.pedrogoncalves.gymtrack;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Alarme do temporizador de descanso.
 *  - schedule({seconds}): agenda um alarme do sistema (AlarmManager.setAlarmClock). Toca à hora certa
 *    mesmo com o ecrã bloqueado, em poupança de energia (Doze) ou com a app em segundo plano.
 *  - cancel(): cancela o alarme agendado e para o som.
 *  - stop(): para o som/vibração de um alarme que esteja a tocar.
 */
@CapacitorPlugin(name = "RestAlarm")
public class RestAlarmPlugin extends Plugin {

    private static final int REQ_FIRE = 4711;
    private static final int REQ_SHOW = 4712;

    private PendingIntent firePending(Context ctx) {
        Intent intent = new Intent(ctx, RestAlarmReceiver.class);
        return PendingIntent.getBroadcast(ctx, REQ_FIRE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        if (seconds == null || seconds < 1) {
            call.reject("seconds inválido");
            return;
        }
        try {
            Context ctx = getContext();
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            long trigger = System.currentTimeMillis() + (long) (seconds * 1000);

            Intent show = new Intent(ctx, MainActivity.class);
            show.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent showPending = PendingIntent.getActivity(ctx, REQ_SHOW, show,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            RestAlarmReceiver.stopRinging();
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(trigger, showPending), firePending(ctx));

            JSObject res = new JSObject();
            res.put("at", trigger);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Não foi possível agendar o alarme: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            Context ctx = getContext();
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            am.cancel(firePending(ctx));
        } catch (Exception ignored) {
            // nada agendado
        }
        RestAlarmReceiver.stopRinging();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RestAlarmReceiver.stopRinging();
        call.resolve();
    }
}
