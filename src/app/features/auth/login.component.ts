import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly cargando = signal(false);
  protected readonly mostrarPassword = signal(false);

  protected readonly form: FormGroup = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  protected campoInvalido(campo: 'email' | 'password'): boolean {
    const c = this.form.get(campo);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected togglePassword(): void {
    this.mostrarPassword.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    try {
      const v = this.form.value;
      await this.auth.login(v.email!, v.password!);
      this.notify.success('Sesion iniciada.');
      this.router.navigateByUrl('/inventario');
    } catch (err: any) {
      this.notify.error(err?.error?.detail || err?.error?.message || 'Credenciales inválidas. Verifica tu correo y contraseña.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected irAlInicio(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.router.navigateByUrl(returnUrl);
  }

  protected async cerrarSesion(): Promise<void> {
    await this.auth.logout(false);
  }
}
