import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignInAuthDto } from './dto/signIn-auth.dto';
import { RegisterDto } from '../users/dto/register.dto';
import { RegisterTrialDto } from './dto/register-trial.dto';
import { Role } from '../role/role.model';
import { Company, CompanyStatus } from '../companies/company.model';
import { Plan } from '../plans/plan.model';
import { Permission } from '../permissions/permission.model';
import { Users, UserStatus } from '../users/users.model';
import { ensureTenantDirectories } from '../../common/utils/storage-path.util';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signIn(data: SignInAuthDto): Promise<any> {
    const user = await this.usersService.findOneByUsername(data.username);

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
      throw new UnauthorizedException(
        'La cuenta se encuentra inactiva o suspendida',
      );
    }

    // Validación multitenancy: estado de la compañía
    let companyData: { id: number; name: string; slug: string; planId?: number | null } | null = null;
    if (user.companyId) {
      const company = await Company.findByPk(user.companyId);
      if (!company) {
        throw new UnauthorizedException('La compañía asignada no existe');
      }
      if (company.trialEndsAt && new Date(company.trialEndsAt) <= new Date()) {
        await company.update({ status: CompanyStatus.INACTIVE });
        await Users.update(
          { status: UserStatus.INACTIVE },
          { where: { companyId: company.id } },
        );
        throw new UnauthorizedException(
          'El período de prueba de 6 días para tu empresa ha vencido. Contacta a HelpCopies para activar tu cuenta.',
        );
      }

      if (company.status === CompanyStatus.INACTIVE || company.status === CompanyStatus.SUSPENDED) {
        throw new UnauthorizedException(
          'El acceso está temporalmente inhabilitado porque la compañía se encuentra inactiva o suspendida',
        );
      }
      companyData = {
        id: company.id,
        name: company.name,
        slug: company.slug,
        planId: company.planId ?? null,
      };
    }

    const compare = await bcrypt.compare(data.password, user.password);
    if (!compare) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    // Actualizar timestamp de último login
    const userInstance = await Users.findByPk(user.id);
    if (userInstance) {
      await userInstance.update({ lastLoginAt: new Date() });
    }

    const payload = {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      companyId: user.companyId ?? null,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        companyId: user.companyId ?? null,
        company: companyData,
        role: user.role,
        roleId: user.roleId,
        isAdmin: user.isAdmin || false,
        image: (user as any).image || null,
        permissions: user.permissions || [],
      },
    };
  }

  async signUp(createUserDto: RegisterDto): Promise<any> {
    const isUnique = await this.usersService.isUserUnique(createUserDto.email);
    if (!isUnique) {
      throw new BadRequestException('Ya existe un usuario con ese email');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const userRole = await Role.findOne({
      where: { slug: 'company_admin', userId: null },
    }) || await Role.findOne({
      where: { slug: 'admin', userId: null },
    });

    if (!userRole) {
      throw new BadRequestException('El rol para nuevos registros no existe en el sistema');
    }

    const newUser = await Users.create({
      name: createUserDto.name,
      lastName: createUserDto.lastName,
      email: createUserDto.email,
      username: createUserDto.username,
      phone: createUserDto.phone,
      password: hashedPassword,
      companyId: createUserDto.companyId ?? null,
      roleId: userRole.id,
      isAdmin: true,
      status: 'ACTIVE',
    } as any);

    const payload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      companyId: newUser.companyId,
      role: userRole.slug,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    return {
      message: 'Usuario registrado exitosamente',
      accessToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        lastName: newUser.lastName,
        email: newUser.email,
        username: newUser.username,
        companyId: newUser.companyId,
        role: userRole.slug,
        isAdmin: newUser.isAdmin,
      },
    };
  }

  async me(authorization: string | undefined): Promise<any> {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('Token no encontrado o inválido');
      }

      const token = authorization.split(' ')[1];
      const decoded = this.jwtService.decode(token) as any;

      if (!decoded || !decoded.email) {
        throw new UnauthorizedException('Token inválido');
      }

      const user = await Users.findOne({
        where: { email: decoded.email },
        attributes: { exclude: ['password'] },
        include: [
          {
            model: Role,
            as: 'role',
            include: [{ model: Permission, as: 'permissions' }],
          },
          {
            model: Permission,
            as: 'directPermissions',
          },
          {
            model: Company,
            as: 'company',
            include: [{ model: Plan, as: 'plan' }],
          },
        ],
      });

      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
        throw new UnauthorizedException(
          'La cuenta se encuentra inactiva o suspendida',
        );
      }

      const rolePerms =
        user.role && user.role.permissions
          ? user.role.permissions.map((p: any) => p.name)
          : [];
      const directPerms = (user as any).directPermissions
        ? (user as any).directPermissions.map((p: any) => p.name)
        : [];
      const mergedPermissions = Array.from(
        new Set([...rolePerms, ...directPerms]),
      );

      return {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        phone: user.phone,
        companyId: user.companyId,
        company: user.company ? user.company.toJSON() : null,
        role: user.role ? user.role.slug : null,
        isAdmin: user.isAdmin,
        image: user.image || null,
        permissions: mergedPermissions,
      };
    } catch (error) {
      throw new UnauthorizedException('Error al procesar la sesión');
    }
  }

  /**
   * Registro público de autoservicio con prueba gratuita de 6 días.
   * Crea la compañía (Tenant), asigna el plan de prueba y crea el usuario admin inicial.
   */
  async registerTrial(dto: RegisterTrialDto): Promise<any> {
    const email = dto.email.toLowerCase().trim();
    const isUnique = await this.usersService.isUserUnique(email);
    if (!isUnique) {
      throw new BadRequestException('Ya existe un usuario registrado con ese correo electrónico');
    }

    if (!dto.phone || !dto.phone.trim()) {
      throw new BadRequestException('El número de teléfono o WhatsApp es obligatorio');
    }

    // 1. Obtener el plan de prueba o el plan seleccionado
    let plan: Plan | null = null;
    if (dto.planId) {
      plan = await Plan.findByPk(dto.planId);
    }
    if (!plan) {
      plan = await Plan.findOne({ where: { slug: 'trial', isActive: true } });
    }
    if (!plan) {
      plan = await Plan.findOne({ where: { isTrial: true, isActive: true } });
    }
    if (!plan) {
      plan = await Plan.findOne({ where: { isDefault: true, isActive: true } });
    }
    if (!plan) {
      plan = await Plan.findOne({ where: { isActive: true }, order: [['id', 'ASC']] });
    }

    const trialDays = plan?.trialDays || 6;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    // 2. Generar slug único para la nueva compañía
    let baseSlug = dto.companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (!baseSlug) baseSlug = 'empresa';

    let uniqueSlug = baseSlug;
    let counter = 1;
    while (await Company.findOne({ where: { slug: uniqueSlug } })) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    // 3. Crear la compañía
    const company = await Company.create({
      name: dto.companyName.trim(),
      slug: uniqueSlug,
      email: email,
      phone: dto.phone.trim(),
      status: CompanyStatus.ACTIVE,
      planId: plan ? plan.id : null,
      isTrial: true,
      trialEndsAt,
      enabledModules: plan?.includedModules || ['documents', 'ai_queries', 'users', 'roles', 'audit'],
      settings: {
        trialStartedAt: new Date().toISOString(),
        registeredVia: 'web_trial_register',
      },
    } as any);

    // 4. Aprovisionar estructura física de almacenamiento
    ensureTenantDirectories(company.id);

    // 5. Asignar rol Administrador de Compañía
    const userRole =
      (await Role.findOne({ where: { slug: 'company_admin', companyId: null } })) ||
      (await Role.findOne({ where: { slug: 'admin', companyId: null } }));

    if (!userRole) {
      throw new BadRequestException('El rol para la compañía no está configurado');
    }

    // 6. Hashear contraseña y crear usuario
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const fullNameParts = dto.fullName.trim().split(' ');
    const name = fullNameParts[0] || 'Admin';
    const lastName = fullNameParts.slice(1).join(' ') || dto.companyName;

    const newUser = await Users.create({
      name,
      lastName,
      email,
      username: email.split('@')[0],
      phone: dto.phone.trim(),
      password: hashedPassword,
      companyId: company.id,
      roleId: userRole.id,
      isAdmin: true,
      status: UserStatus.ACTIVE,
    } as any);

    // 7. Generar token de sesión
    const payload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      companyId: company.id,
      role: userRole.slug,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    return {
      message: 'Cuenta creada exitosamente. Tu prueba gratuita de 6 días está activa.',
      accessToken,
      trialEndsAt,
      trialDaysRemaining: trialDays,
      user: {
        id: newUser.id,
        name: newUser.name,
        lastName: newUser.lastName,
        email: newUser.email,
        username: newUser.username,
        phone: newUser.phone,
        companyId: company.id,
        role: userRole.slug,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
        trialEndsAt,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              slug: plan.slug,
              isTrial: true,
            }
          : null,
      },
    };
  }
}
