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
import { Role } from '../role/role.model';
import { Company, CompanyStatus } from '../companies/company.model';
import { Permission } from '../permissions/permission.model';
import { Users } from '../users/users.model';

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
    let companyData: { id: number; name: string; slug: string } | null = null;
    if (user.companyId) {
      const company = await Company.findByPk(user.companyId);
      if (!company) {
        throw new UnauthorizedException('La compañía asignada no existe');
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
}
